package com.habbux.network;

import com.habbux.admin.HotelSettings;
import com.habbux.admin.HotelSettingsService;
import com.habbux.config.AppConfig;
import com.habbux.room.RoomManager;
import com.habbux.session.ConnectionRegistry;
import com.habbux.session.NetworkMetrics;
import com.habbux.theme.LoginThemeAssetStorage;
import com.habbux.theme.LoginThemeConfiguration;
import com.habbux.theme.LoginThemeId;
import com.habbux.theme.LoginThemeService;
import com.habbux.theme.LoginThemesSnapshot;
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
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Function;

/** Versioned HTTP adapter for the protected owner panel and public login presentation. */
final class AdminHttpHandler extends SimpleChannelInboundHandler<FullHttpRequest> {
    private static final String ADMIN_PREFIX = "/admin-api/v1/";
    private static final String THEME_PREFIX = "/admin-api/v1/login-themes";
    private static final String PUBLIC_THEME_PREFIX = "/login-theme/v1/";
    private static final String SETTINGS_PATH = "/admin-api/v1/settings";
    private static final String OVERVIEW_PATH = "/admin-api/v1/overview";
    private static final int MAX_SETTINGS_FORM_BYTES = 1_024;
    private static final int MAX_THEME_FORM_BYTES = 4_096;
    private static final long WRITE_TIMEOUT_MILLIS = 3_000;
    private final Set<String> allowedOrigins;
    private final ConnectionRegistry registry;
    private final RoomManager roomManager;
    private final HotelSettingsService settings;
    private final LoginThemeService loginThemes;
    private final AtomicLong requests = new AtomicLong();
    private final AtomicLong rejected = new AtomicLong();
    private final AtomicLong updates = new AtomicLong();
    private final AtomicLong failures = new AtomicLong();

    AdminHttpHandler(AppConfig config, ConnectionRegistry registry, RoomManager roomManager, HotelSettingsService settings) {
        this(config, registry, roomManager, settings, LoginThemeService.unavailable());
    }

    AdminHttpHandler(AppConfig config, ConnectionRegistry registry, RoomManager roomManager,
                     HotelSettingsService settings, LoginThemeService loginThemes) {
        allowedOrigins = config.allowedOrigins();
        this.registry = registry;
        this.roomManager = roomManager;
        this.settings = settings;
        this.loginThemes = loginThemes;
    }

    @Override
    protected void channelRead0(ChannelHandlerContext ctx, FullHttpRequest request) {
        QueryStringDecoder decoder = new QueryStringDecoder(request.uri());
        String path = decoder.path();
        if (path.startsWith(PUBLIC_THEME_PREFIX)) {
            publicTheme(ctx, request, decoder, path);
            return;
        }
        if (!path.startsWith(ADMIN_PREFIX)) {
            ctx.fireChannelRead(request.retain());
            return;
        }
        requests.incrementAndGet();
        if (!decoder.parameters().isEmpty()) {
            reject(ctx, request, HttpResponseStatus.BAD_REQUEST, "invalid_request", "A rota não aceita parâmetros.");
            return;
        }
        if (path.startsWith(THEME_PREFIX)) {
            themeAdmin(ctx, request, path);
            return;
        }
        hotelAdmin(ctx, request, path);
    }

    private void publicTheme(ChannelHandlerContext ctx, FullHttpRequest request, QueryStringDecoder decoder, String path) {
        if (!decoder.parameters().isEmpty()) {
            reject(ctx, request, HttpResponseStatus.BAD_REQUEST, "invalid_request", "A rota não aceita parâmetros.");
            return;
        }
        if (!request.method().equals(HttpMethod.GET)) {
            reject(ctx, request, HttpResponseStatus.METHOD_NOT_ALLOWED, "method_not_allowed", "Método não permitido.");
            return;
        }
        LoginThemesSnapshot snapshot = loginThemes.current();
        if ("/login-theme/v1/active".equals(path)) {
            writeJson(ctx, request.protocolVersion(), HttpUtil.isKeepAlive(request), HttpResponseStatus.OK,
                    publicThemeJson(snapshot.activeConfiguration()));
            return;
        }
        String previewPrefix = "/login-theme/v1/preview/";
        if (path.startsWith(previewPrefix) && path.length() > previewPrefix.length()) {
            try {
                LoginThemeId theme = LoginThemeId.parse(path.substring(previewPrefix.length()));
                writeJson(ctx, request.protocolVersion(), HttpUtil.isKeepAlive(request), HttpResponseStatus.OK,
                        publicThemeJson(snapshot.configuration(theme)));
                return;
            } catch (IllegalArgumentException ignored) {
                // The generic not-found response below does not disclose invalid internal values.
            }
        }
        reject(ctx, request, HttpResponseStatus.NOT_FOUND, "not_found", "Tema não encontrado.");
    }

    private void hotelAdmin(ChannelHandlerContext ctx, FullHttpRequest request, String path) {
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

    private void themeAdmin(ChannelHandlerContext ctx, FullHttpRequest request, String path) {
        if (!loginThemes.available()) {
            fail(ctx, request, HttpResponseStatus.SERVICE_UNAVAILABLE, "unavailable", "Os temas estão indisponíveis.");
            return;
        }
        if (THEME_PREFIX.equals(path)) {
            if (request.method().equals(HttpMethod.GET)) {
                writeJson(ctx, request.protocolVersion(), HttpUtil.isKeepAlive(request), HttpResponseStatus.OK,
                        themesJson(loginThemes.current()));
                return;
            }
            reject(ctx, request, HttpResponseStatus.METHOD_NOT_ALLOWED, "method_not_allowed", "Método não permitido.");
            return;
        }
        String remaining = path.substring(THEME_PREFIX.length());
        if (!remaining.startsWith("/")) {
            reject(ctx, request, HttpResponseStatus.NOT_FOUND, "not_found", "Tema não encontrado.");
            return;
        }
        String[] segments = remaining.substring(1).split("/", -1);
        if (segments.length < 1 || segments.length > 2 || segments[0].isEmpty()) {
            reject(ctx, request, HttpResponseStatus.NOT_FOUND, "not_found", "Tema não encontrado.");
            return;
        }
        final LoginThemeId theme;
        try { theme = LoginThemeId.parse(segments[0]); }
        catch (IllegalArgumentException exception) {
            reject(ctx, request, HttpResponseStatus.NOT_FOUND, "not_found", "Tema não encontrado.");
            return;
        }
        String action = segments.length == 2 ? segments[1] : "";
        if (action.isEmpty() && request.method().equals(HttpMethod.GET)) {
            writeJson(ctx, request.protocolVersion(), HttpUtil.isKeepAlive(request), HttpResponseStatus.OK,
                    adminThemeJson(loginThemes.current().configuration(theme)));
            return;
        }
        if (action.isEmpty() && request.method().equals(HttpMethod.PUT)) {
            updateTheme(ctx, request, theme);
            return;
        }
        if ("activate".equals(action) && request.method().equals(HttpMethod.POST)) {
            if (!validOrigin(ctx, request)) return;
            if (request.content().isReadable()) {
                reject(ctx, request, HttpResponseStatus.BAD_REQUEST, "invalid_request", "A ativação não recebe dados.");
                return;
            }
            respondAsync(ctx, request, loginThemes.activate(theme), AdminHttpHandler::themesJson);
            return;
        }
        if ("restore".equals(action) && request.method().equals(HttpMethod.POST)) {
            if (!validOrigin(ctx, request)) return;
            if (request.content().isReadable()) {
                reject(ctx, request, HttpResponseStatus.BAD_REQUEST, "invalid_request", "A restauração não recebe dados.");
                return;
            }
            respondAsync(ctx, request, loginThemes.restore(theme), AdminHttpHandler::adminThemeJson);
            return;
        }
        if ("asset".equals(action) && request.method().equals(HttpMethod.POST)) {
            uploadThemeAsset(ctx, request, theme);
            return;
        }
        reject(ctx, request, HttpResponseStatus.METHOD_NOT_ALLOWED, "method_not_allowed", "Método não permitido.");
    }

    private void updateSettings(ChannelHandlerContext ctx, FullHttpRequest request) {
        if (!validOrigin(ctx, request) || !validForm(ctx, request, MAX_SETTINGS_FORM_BYTES)) return;
        final HotelSettings requested;
        try {
            Map<String, String> form = decodeForm(request.content(),
                    Set.of("hotelName", "motd", "registrationsEnabled", "maintenanceEnabled"));
            requested = new HotelSettings(required(form, "hotelName"), required(form, "motd"),
                    requiredBoolean(form, "registrationsEnabled"), requiredBoolean(form, "maintenanceEnabled"));
        } catch (IllegalArgumentException exception) {
            reject(ctx, request, HttpResponseStatus.BAD_REQUEST, "invalid_request", "Confira os campos informados.");
            return;
        }
        respondAsync(ctx, request, settings.update(requested), AdminHttpHandler::settingsJson);
    }

    private void updateTheme(ChannelHandlerContext ctx, FullHttpRequest request, LoginThemeId theme) {
        if (!validOrigin(ctx, request) || !validForm(ctx, request, MAX_THEME_FORM_BYTES)) return;
        final LoginThemeConfiguration requested;
        try {
            Map<String, String> form = decodeForm(request.content(), Set.of("logoText", "eyebrow", "title", "description",
                    "ctaText", "ctaVisible", "institutionalText", "institutionalUrl", "primaryColor", "secondaryColor",
                    "buttonColor", "glassOpacity", "blurPixels", "cardOpacity", "glowIntensity", "borderRadius",
                    "decorationsEnabled"));
            LoginThemeConfiguration current = loginThemes.current().configuration(theme);
            requested = new LoginThemeConfiguration(theme, required(form, "logoText"), required(form, "eyebrow"),
                    required(form, "title"), required(form, "description"), required(form, "ctaText"),
                    requiredBoolean(form, "ctaVisible"), required(form, "institutionalText"), required(form, "institutionalUrl"),
                    required(form, "primaryColor"), required(form, "secondaryColor"), required(form, "buttonColor"),
                    requiredInteger(form, "glassOpacity"), requiredInteger(form, "blurPixels"),
                    requiredInteger(form, "cardOpacity"), requiredInteger(form, "glowIntensity"), requiredInteger(form, "borderRadius"),
                    requiredBoolean(form, "decorationsEnabled"), current.heroAsset(), current.version());
        } catch (IllegalArgumentException exception) {
            reject(ctx, request, HttpResponseStatus.BAD_REQUEST, "invalid_request", "Confira os campos informados.");
            return;
        }
        respondAsync(ctx, request, loginThemes.update(requested), AdminHttpHandler::adminThemeJson);
    }

    private void uploadThemeAsset(ChannelHandlerContext ctx, FullHttpRequest request, LoginThemeId theme) {
        if (!validOrigin(ctx, request)) return;
        String contentType = request.headers().get(HttpHeaderNames.CONTENT_TYPE);
        if (contentType == null || request.content().readableBytes() > LoginThemeAssetStorage.MAX_BYTES
                || !request.content().isReadable()) {
            reject(ctx, request, HttpResponseStatus.BAD_REQUEST, "invalid_request", "Envie uma imagem PNG ou JPEG de até 2 MB.");
            return;
        }
        byte[] bytes = new byte[request.content().readableBytes()];
        request.content().getBytes(request.content().readerIndex(), bytes);
        respondAsync(ctx, request, loginThemes.upload(theme, bytes, contentType), AdminHttpHandler::adminThemeJson);
    }

    private boolean validOrigin(ChannelHandlerContext ctx, FullHttpRequest request) {
        String origin = request.headers().get(HttpHeaderNames.ORIGIN);
        if (origin == null || !allowedOrigins.contains(origin)) {
            reject(ctx, request, HttpResponseStatus.FORBIDDEN, "forbidden", "Origem não autorizada.");
            return false;
        }
        return true;
    }

    private boolean validForm(ChannelHandlerContext ctx, FullHttpRequest request, int maximumBytes) {
        String contentType = request.headers().get(HttpHeaderNames.CONTENT_TYPE);
        if (contentType == null || !contentType.toLowerCase(java.util.Locale.ROOT)
                .startsWith(HttpHeaderValues.APPLICATION_X_WWW_FORM_URLENCODED.toString())) {
            reject(ctx, request, HttpResponseStatus.UNSUPPORTED_MEDIA_TYPE, "invalid_request", "Formato do formulário inválido.");
            return false;
        }
        if (request.content().readableBytes() > maximumBytes) {
            reject(ctx, request, HttpResponseStatus.REQUEST_ENTITY_TOO_LARGE, "invalid_request", "Formulário excede o limite.");
            return false;
        }
        return true;
    }

    private <T> void respondAsync(ChannelHandlerContext ctx, FullHttpRequest request, CompletableFuture<T> future,
                                  Function<T, String> serializer) {
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
        future.whenComplete((saved, failure) -> {
            try {
                ctx.executor().execute(() -> {
                    if (!responded.compareAndSet(false, true)) return;
                    timeout.cancel(false);
                    if (failure != null || saved == null) {
                        failures.incrementAndGet();
                        HttpResponseStatus status = isRejected(failure) ? HttpResponseStatus.SERVICE_UNAVAILABLE
                                : HttpResponseStatus.INTERNAL_SERVER_ERROR;
                        writeJson(ctx, version, keepAlive, status,
                                errorJson("unavailable", "Não foi possível gravar a configuração."));
                        return;
                    }
                    updates.incrementAndGet();
                    writeJson(ctx, version, keepAlive, HttpResponseStatus.OK, serializer.apply(saved));
                });
            } catch (RejectedExecutionException ignored) {
                // The connection event loop owns the response lifecycle and is already closing.
            }
        });
    }

    private static boolean isRejected(Throwable failure) {
        Throwable current = failure;
        while (current != null) {
            if (current instanceof RejectedExecutionException) return true;
            current = current.getCause();
        }
        return false;
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
        return "{\"hotelName\":" + jsonString(current.hotelName()) + ",\"motd\":" + jsonString(current.motd())
                + ",\"registrationsEnabled\":" + current.registrationsEnabled()
                + ",\"maintenanceEnabled\":" + current.maintenanceEnabled() + "}";
    }

    private static String themesJson(LoginThemesSnapshot snapshot) {
        StringBuilder json = new StringBuilder("{\"activeTheme\":").append(jsonString(snapshot.activeTheme().value()))
                .append(",\"activeVersion\":").append(snapshot.activeVersion()).append(",\"themes\":[");
        boolean first = true;
        for (LoginThemeId theme : LoginThemeId.all()) {
            if (!first) json.append(',');
            first = false;
            json.append("{\"id\":").append(jsonString(theme.value())).append(",\"name\":")
                    .append(jsonString(theme.displayName())).append(",\"description\":")
                    .append(jsonString(theme.description())).append(",\"active\":")
                    .append(theme == snapshot.activeTheme()).append(",\"configuration\":")
                    .append(adminThemeJson(snapshot.configuration(theme))).append('}');
        }
        return json.append("]}").toString();
    }

    private static String publicThemeJson(LoginThemeConfiguration theme) { return themeJson(theme, false); }

    private static String adminThemeJson(LoginThemeConfiguration theme) { return themeJson(theme, true); }

    private static String themeJson(LoginThemeConfiguration theme, boolean includeAssetKey) {
        String assetUrl = "default".equals(theme.heroAsset()) ? "/themes/" + theme.theme().value() + ".webp"
                : "/login-theme-assets/" + theme.heroAsset();
        StringBuilder json = new StringBuilder("{\"theme\":").append(jsonString(theme.theme().value()))
                .append(",\"logoText\":").append(jsonString(theme.logoText()))
                .append(",\"eyebrow\":").append(jsonString(theme.eyebrow()))
                .append(",\"title\":").append(jsonString(theme.title()))
                .append(",\"description\":").append(jsonString(theme.description()))
                .append(",\"ctaText\":").append(jsonString(theme.ctaText()))
                .append(",\"ctaVisible\":").append(theme.ctaVisible())
                .append(",\"institutionalText\":").append(jsonString(theme.institutionalText()))
                .append(",\"institutionalUrl\":").append(jsonString(theme.institutionalUrl()))
                .append(",\"primaryColor\":").append(jsonString(theme.primaryColor()))
                .append(",\"secondaryColor\":").append(jsonString(theme.secondaryColor()))
                .append(",\"buttonColor\":").append(jsonString(theme.buttonColor()))
                .append(",\"glassOpacity\":").append(theme.glassOpacity())
                .append(",\"blurPixels\":").append(theme.blurPixels())
                .append(",\"cardOpacity\":").append(theme.cardOpacity())
                .append(",\"glowIntensity\":").append(theme.glowIntensity())
                .append(",\"borderRadius\":").append(theme.borderRadius())
                .append(",\"decorationsEnabled\":").append(theme.decorationsEnabled())
                .append(",\"assetUrl\":").append(jsonString(assetUrl))
                .append(",\"version\":").append(theme.version());
        if (includeAssetKey) json.append(",\"heroAsset\":").append(jsonString(theme.heroAsset()));
        return json.append('}').toString();
    }

    private static Map<String, String> decodeForm(ByteBuf content, Set<String> expected) {
        String input = content.toString(StandardCharsets.UTF_8);
        if (input.isEmpty()) throw new IllegalArgumentException("form is empty");
        String[] pairs = input.split("&", -1);
        if (pairs.length != expected.size()) throw new IllegalArgumentException("unexpected form field count");
        Map<String, String> decoded = new HashMap<>();
        for (String pair : pairs) {
            int separator = pair.indexOf('=');
            if (separator < 1) throw new IllegalArgumentException("malformed form field");
            String key = URLDecoder.decode(pair.substring(0, separator), StandardCharsets.UTF_8);
            String value = URLDecoder.decode(pair.substring(separator + 1), StandardCharsets.UTF_8);
            if (decoded.putIfAbsent(key, value) != null) throw new IllegalArgumentException("duplicate form field");
        }
        if (!decoded.keySet().equals(expected)) throw new IllegalArgumentException("unexpected form fields");
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

    private static int requiredInteger(Map<String, String> form, String key) {
        try { return Integer.parseInt(required(form, key)); }
        catch (NumberFormatException exception) { throw new IllegalArgumentException("invalid integer form field", exception); }
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
