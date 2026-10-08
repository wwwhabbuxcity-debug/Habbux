package com.habbux.network;

import com.habbux.admin.HotelSettings;
import com.habbux.admin.HotelSettingsService;
import com.habbux.config.AppConfig;
import com.habbux.room.RoomManager;
import com.habbux.session.ConnectionRegistry;
import com.habbux.session.NetworkMetrics;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import io.netty.channel.ChannelFutureListener;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.SimpleChannelInboundHandler;
import io.netty.handler.codec.http.DefaultFullHttpResponse;
import io.netty.handler.codec.http.FullHttpRequest;
import io.netty.handler.codec.http.HttpHeaderNames;
import io.netty.handler.codec.http.HttpHeaderValues;
import io.netty.handler.codec.http.HttpMethod;
import io.netty.handler.codec.http.HttpResponseStatus;
import io.netty.handler.codec.http.HttpUtil;
import io.netty.handler.codec.http.HttpVersion;
import io.netty.handler.codec.http.QueryStringDecoder;
import io.netty.util.concurrent.ScheduledFuture;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Versioned HTTP adapter for the protected owner panel and the small public hotel status. */
final class AdminHttpHandler extends SimpleChannelInboundHandler<FullHttpRequest> {
    private static final Logger LOG = LoggerFactory.getLogger(AdminHttpHandler.class);
    private static final String ADMIN_PREFIX = "/admin-api/v1/";
    private static final String SETTINGS_PATH = "/admin-api/v1/settings";
    private static final String OVERVIEW_PATH = "/admin-api/v1/overview";
    private static final int MAX_FORM_BYTES = 1_024;
    private static final long WRITE_TIMEOUT_MILLIS = 3_000;
    private final Set<String> allowedOrigins;
    private final ConnectionRegistry registry;
    private final RoomManager roomManager;
    private final HotelSettingsService settings;
    private final AtomicLong requests = new AtomicLong();
    private final AtomicLong rejected = new AtomicLong();
    private final AtomicLong updates = new AtomicLong();
    private final AtomicLong failures = new AtomicLong();

    AdminHttpHandler(AppConfig config, ConnectionRegistry registry, RoomManager roomManager,
                     HotelSettingsService settings) {
        allowedOrigins = config.allowedOrigins();
        this.registry = registry;
        this.roomManager = roomManager;
        this.settings = settings;
    }

    @Override
    protected void channelRead0(ChannelHandlerContext ctx, FullHttpRequest request) {
        QueryStringDecoder decoder = new QueryStringDecoder(request.uri());
        String path = decoder.path();
        if (!path.startsWith(ADMIN_PREFIX)) {
            ctx.fireChannelRead(request.retain());
            return;
        }
        requests.incrementAndGet();
        if (!decoder.parameters().isEmpty()) {
            reject(ctx, request, HttpResponseStatus.BAD_REQUEST, "invalid_request", "A rota não aceita parâmetros.");
            return;
        }
        if (!settings.available()) {
            fail(ctx, request, HttpResponseStatus.SERVICE_UNAVAILABLE, "unavailable", "Os controles estão indisponíveis.");
            return;
        }
        if (OVERVIEW_PATH.equals(path) && request.method().equals(HttpMethod.GET)) {
            writeJson(ctx, request.protocolVersion(), HttpUtil.isKeepAlive(request), HttpResponseStatus.OK, overviewJson());
            return;
        }
        if (SETTINGS_PATH.equals(path) && request.method().equals(HttpMethod.GET)) {
            writeJson(ctx, request.protocolVersion(), HttpUtil.isKeepAlive(request), HttpResponseStatus.OK,
                    settingsJson(settings.current()));
            return;
        }
        if (SETTINGS_PATH.equals(path) && request.method().equals(HttpMethod.PUT)) {
            updateSettings(ctx, request);
            return;
        }
        if (SETTINGS_PATH.equals(path) || OVERVIEW_PATH.equals(path)) {
            reject(ctx, request, HttpResponseStatus.METHOD_NOT_ALLOWED, "method_not_allowed", "Método não permitido.");
            return;
        }
        reject(ctx, request, HttpResponseStatus.NOT_FOUND, "not_found", "Rota administrativa não encontrada.");
    }

    private void updateSettings(ChannelHandlerContext ctx, FullHttpRequest request) {
        String origin = request.headers().get(HttpHeaderNames.ORIGIN);
        if (origin == null || !allowedOrigins.contains(origin)) {
            reject(ctx, request, HttpResponseStatus.FORBIDDEN, "forbidden", "Origem não autorizada.");
            return;
        }
        String contentType = request.headers().get(HttpHeaderNames.CONTENT_TYPE);
        if (contentType == null || !contentType.toLowerCase(java.util.Locale.ROOT)
                .startsWith(HttpHeaderValues.APPLICATION_X_WWW_FORM_URLENCODED.toString())) {
            reject(ctx, request, HttpResponseStatus.UNSUPPORTED_MEDIA_TYPE, "invalid_request", "Formato do formulário inválido.");
            return;
        }
        if (request.content().readableBytes() > MAX_FORM_BYTES) {
            reject(ctx, request, HttpResponseStatus.REQUEST_ENTITY_TOO_LARGE, "invalid_request", "Formulário excede o limite.");
            return;
        }
        final HotelSettings requested;
        try {
            Map<String, String> form = decodeForm(request.content());
            requested = new HotelSettings(required(form, "hotelName"), required(form, "motd"),
                    requiredBoolean(form, "registrationsEnabled"), requiredBoolean(form, "maintenanceEnabled"));
        } catch (IllegalArgumentException exception) {
            reject(ctx, request, HttpResponseStatus.BAD_REQUEST, "invalid_request", "Confira os campos informados.");
            return;
        }
        HttpVersion version = request.protocolVersion();
        boolean keepAlive = HttpUtil.isKeepAlive(request);
        AtomicBoolean responded = new AtomicBoolean();
        ScheduledFuture<?> timeout = ctx.executor().schedule(() -> {
            if (responded.compareAndSet(false, true)) {
                failures.incrementAndGet();
                writeJson(ctx, version, keepAlive, HttpResponseStatus.GATEWAY_TIMEOUT,
                        errorJson("timeout", "A gravação demorou mais que o limite."));
            }
        }, WRITE_TIMEOUT_MILLIS, TimeUnit.MILLISECONDS);
        settings.update(requested).whenComplete((saved, failure) -> {
            try {
                ctx.executor().execute(() -> {
                    if (!responded.compareAndSet(false, true)) return;
                    timeout.cancel(false);
                    if (failure != null || saved == null) {
                        failures.incrementAndGet();
                        HttpResponseStatus status = failure instanceof RejectedExecutionException
                                ? HttpResponseStatus.SERVICE_UNAVAILABLE : HttpResponseStatus.INTERNAL_SERVER_ERROR;
                        writeJson(ctx, version, keepAlive, status,
                                errorJson("unavailable", "Não foi possível gravar a configuração."));
                        return;
                    }
                    updates.incrementAndGet();
                    writeJson(ctx, version, keepAlive, HttpResponseStatus.OK, settingsJson(saved));
                });
            } catch (RejectedExecutionException ignored) {
                // The connection event loop is already closing and owns the response lifecycle.
            }
        });
    }

    private String overviewJson() {
        HotelSettings current = settings.current();
        NetworkMetrics network = registry.metrics();
        RoomManager.MetricsSnapshot rooms = roomManager == null ? null : roomManager.snapshot();
        HotelSettingsService.Metrics control = settings.snapshot();
        return "{\"settings\":" + settingsJson(current)
                + ",\"server\":{\"activeConnections\":" + network.activeConnections()
                + ",\"activeSessions\":" + network.activeSessions()
                + ",\"activeRooms\":" + (rooms == null ? 0 : rooms.activeRooms())
                + ",\"activeRoomUsers\":" + (rooms == null ? 0 : rooms.activeRoomUsers()) + "}"
                + ",\"control\":{\"active\":" + control.active()
                + ",\"queued\":" + control.queued()
                + ",\"requests\":" + requests.get()
                + ",\"updates\":" + updates.get()
                + ",\"rejected\":" + (rejected.get() + control.rejected())
                + ",\"failures\":" + failures.get() + "}}";
    }

    private static String settingsJson(HotelSettings current) {
        return "{\"hotelName\":" + jsonString(current.hotelName())
                + ",\"motd\":" + jsonString(current.motd())
                + ",\"registrationsEnabled\":" + current.registrationsEnabled()
                + ",\"maintenanceEnabled\":" + current.maintenanceEnabled() + "}";
    }

    private static Map<String, String> decodeForm(ByteBuf content) {
        String input = content.toString(StandardCharsets.UTF_8);
        if (input.isEmpty()) throw new IllegalArgumentException("form is empty");
        String[] pairs = input.split("&", -1);
        if (pairs.length != 4) throw new IllegalArgumentException("unexpected form field count");
        Map<String, String> decoded = new HashMap<>();
        for (String pair : pairs) {
            int separator = pair.indexOf('=');
            if (separator < 1) throw new IllegalArgumentException("malformed form field");
            String key = URLDecoder.decode(pair.substring(0, separator), StandardCharsets.UTF_8);
            String value = URLDecoder.decode(pair.substring(separator + 1), StandardCharsets.UTF_8);
            if (decoded.putIfAbsent(key, value) != null) throw new IllegalArgumentException("duplicate form field");
        }
        if (!decoded.keySet().equals(Set.of("hotelName", "motd", "registrationsEnabled", "maintenanceEnabled"))) {
            throw new IllegalArgumentException("unexpected form fields");
        }
        return decoded;
    }

    private static String required(Map<String, String> form, String key) {
        String value = form.get(key);
        if (value == null) throw new IllegalArgumentException("missing form field");
        return value;
    }

    private static boolean requiredBoolean(Map<String, String> form, String key) {
        return switch (required(form, key)) {
            case "true" -> true;
            case "false" -> false;
            default -> throw new IllegalArgumentException("invalid boolean form field");
        };
    }

    private void reject(ChannelHandlerContext ctx, FullHttpRequest request, HttpResponseStatus status, String code, String message) {
        rejected.incrementAndGet();
        writeJson(ctx, request.protocolVersion(), HttpUtil.isKeepAlive(request), status, errorJson(code, message));
    }

    private void fail(ChannelHandlerContext ctx, FullHttpRequest request, HttpResponseStatus status, String code, String message) {
        failures.incrementAndGet();
        writeJson(ctx, request.protocolVersion(), HttpUtil.isKeepAlive(request), status, errorJson(code, message));
    }

    private static String errorJson(String code, String message) {
        return "{\"error\":{\"code\":" + jsonString(code) + ",\"message\":" + jsonString(message) + "}}";
    }

    private static String jsonString(String value) {
        StringBuilder escaped = new StringBuilder(value.length() + 2).append('"');
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            switch (character) {
                case '"' -> escaped.append("\\\"");
                case '\\' -> escaped.append("\\\\");
                case '\b' -> escaped.append("\\b");
                case '\f' -> escaped.append("\\f");
                case '\n' -> escaped.append("\\n");
                case '\r' -> escaped.append("\\r");
                case '\t' -> escaped.append("\\t");
                default -> {
                    if (character < 0x20) escaped.append(String.format("\\u%04x", (int) character));
                    else escaped.append(character);
                }
            }
        }
        return escaped.append('"').toString();
    }

    private static void writeJson(ChannelHandlerContext ctx, HttpVersion version, boolean keepAlive,
                                  HttpResponseStatus status, String json) {
        ByteBuf content = Unpooled.copiedBuffer(json, StandardCharsets.UTF_8);
        DefaultFullHttpResponse response = new DefaultFullHttpResponse(version, status, content);
        response.headers().set(HttpHeaderNames.CONTENT_TYPE, "application/json; charset=utf-8");
        response.headers().setInt(HttpHeaderNames.CONTENT_LENGTH, content.readableBytes());
        response.headers().set(HttpHeaderNames.CACHE_CONTROL, "no-store");
        response.headers().set("X-Content-Type-Options", "nosniff");
        if (!keepAlive) {
            response.headers().set(HttpHeaderNames.CONNECTION, HttpHeaderValues.CLOSE);
            ctx.writeAndFlush(response).addListener(ChannelFutureListener.CLOSE);
            return;
        }
        ctx.writeAndFlush(response);
    }
}
