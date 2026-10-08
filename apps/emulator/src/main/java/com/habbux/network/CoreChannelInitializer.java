package com.habbux.network;

import com.habbux.config.AppConfig;
import com.habbux.admin.HotelSettingsService;
import com.habbux.theme.LoginThemeService;
import com.habbux.theme.LoginThemeAssetStorage;
import com.habbux.auth.AuthService;
import com.habbux.session.ConnectionRegistry;
import com.habbux.session.Session;
import com.habbux.room.RoomManager;
import io.netty.channel.ChannelInitializer;
import io.netty.channel.socket.SocketChannel;
import io.netty.handler.codec.http.HttpObjectAggregator;
import io.netty.handler.codec.http.HttpServerCodec;
import io.netty.handler.codec.http.websocketx.WebSocketFrameAggregator;
import io.netty.handler.codec.http.websocketx.WebSocketServerProtocolConfig;
import io.netty.handler.codec.http.websocketx.WebSocketServerProtocolHandler;
import io.netty.handler.timeout.IdleStateHandler;
import io.netty.util.AttributeKey;
import io.netty.channel.group.ChannelGroup;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

final class CoreChannelInitializer extends ChannelInitializer<SocketChannel> {
    static final AttributeKey<Session> SESSION = AttributeKey.valueOf("habbux.session");
    private static final Logger LOG = LoggerFactory.getLogger(CoreChannelInitializer.class);
    private final AppConfig config;
    private final ConnectionRegistry registry;
    private final ChannelGroup childChannels;
    private final AuthService authService;
    private final RoomManager roomManager;
    private final HotelSettingsService hotelSettings;
    private final LoginThemeService loginThemes;

    CoreChannelInitializer(AppConfig config, ConnectionRegistry registry, ChannelGroup childChannels) {
        this(config, registry, childChannels, null, null, HotelSettingsService.unavailable(), LoginThemeService.unavailable());
    }

    CoreChannelInitializer(AppConfig config, ConnectionRegistry registry, ChannelGroup childChannels,
                           AuthService authService) {
        this(config, registry, childChannels, authService, null, HotelSettingsService.unavailable(), LoginThemeService.unavailable());
    }

    CoreChannelInitializer(AppConfig config, ConnectionRegistry registry, ChannelGroup childChannels,
                           AuthService authService, RoomManager roomManager) {
        this(config, registry, childChannels, authService, roomManager, HotelSettingsService.unavailable(), LoginThemeService.unavailable());
    }

    CoreChannelInitializer(AppConfig config, ConnectionRegistry registry, ChannelGroup childChannels,
                           AuthService authService, RoomManager roomManager, HotelSettingsService hotelSettings) {
        this(config, registry, childChannels, authService, roomManager, hotelSettings, LoginThemeService.unavailable());
    }

    CoreChannelInitializer(AppConfig config, ConnectionRegistry registry, ChannelGroup childChannels,
                           AuthService authService, RoomManager roomManager, HotelSettingsService hotelSettings,
                           LoginThemeService loginThemes) {
        this.config = config;
        this.registry = registry;
        this.childChannels = childChannels;
        this.authService = authService;
        this.roomManager = roomManager;
        this.hotelSettings = hotelSettings;
        this.loginThemes = loginThemes;
    }

    @Override
    protected void initChannel(SocketChannel channel) {
        Session session = registry.tryConnect();
        if (session == null) {
            LOG.atWarn().addKeyValue("event", "connection.rejected").addKeyValue("reason", "capacity")
                    .log("Habbux Core connection limit reached");
            channel.close();
            return;
        }
        channel.attr(SESSION).set(session);
        channel.pipeline().addLast("http", new HttpServerCodec());
        channel.pipeline().addLast("http-aggregate", new HttpObjectAggregator(LoginThemeAssetStorage.MAX_BYTES + 65_536));
        channel.pipeline().addLast("admin-http", new AdminHttpHandler(config, registry, roomManager, hotelSettings, loginThemes));
        channel.pipeline().addLast("origin", new OriginValidationHandler(config.allowedOrigins(), registry));
        channel.pipeline().addLast("websocket", new WebSocketServerProtocolHandler(
                WebSocketServerProtocolConfig.newBuilder()
                        .websocketPath("/ws")
                        .checkStartsWith(false)
                        .handshakeTimeoutMillis(config.handshakeTimeoutMillis())
                        .maxFramePayloadLength(CoreChannelHandler.HEADER_BYTES + config.maxPayloadBytes())
                        .handleCloseFrames(true)
                        .build()));
        channel.pipeline().addLast("websocket-aggregate", new WebSocketFrameAggregator(
                CoreChannelHandler.HEADER_BYTES + config.maxPayloadBytes()));
        channel.pipeline().addLast("idle", new IdleStateHandler(config.idleTimeoutSeconds(), 0, 0, TimeUnit.SECONDS));
        channel.pipeline().addLast("core", new CoreChannelHandler(config, registry, authService, roomManager, hotelSettings));
        childChannels.add(channel);
    }
}
