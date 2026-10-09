package com.habbux.network;

import com.habbux.config.AppConfig;
import com.habbux.admin.HotelSettingsService;
import com.habbux.auth.AuthFailure;
import com.habbux.auth.AuthResult;
import com.habbux.auth.AuthService;
import com.habbux.protocol.CoreMessage;
import com.habbux.protocol.FrameCodec;
import com.habbux.protocol.HabbuxFrame;
import com.habbux.protocol.ProtocolException;
import com.habbux.protocol.AuthPayloadCodec;
import com.habbux.protocol.ServerErrorCode;
import com.habbux.room.RoomClient;
import com.habbux.room.RoomId;
import com.habbux.room.RoomManager;
import com.habbux.room.RoomOutbound;
import com.habbux.room.RoomPayloadCodec;
import com.habbux.room.RoomRuntime;
import com.habbux.session.ConnectionRegistry;
import com.habbux.session.Session;
import io.netty.buffer.ByteBuf;
import io.netty.channel.ChannelFutureListener;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.SimpleChannelInboundHandler;
import io.netty.handler.codec.http.websocketx.BinaryWebSocketFrame;
import io.netty.handler.codec.http.websocketx.CloseWebSocketFrame;
import io.netty.handler.codec.http.websocketx.WebSocketFrame;
import io.netty.handler.timeout.IdleStateEvent;
import io.netty.util.concurrent.ScheduledFuture;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.RejectedExecutionException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

final class CoreChannelHandler extends SimpleChannelInboundHandler<WebSocketFrame> {
    static final int HEADER_BYTES = FrameCodec.HEADER_BYTES;
    private static final Logger LOG = LoggerFactory.getLogger(CoreChannelHandler.class);
    private final AppConfig config;
    private final ConnectionRegistry registry;
    private final FrameCodec codec = new FrameCodec();
    private final MessageTokenBucket messageRateLimiter;
    private final AuthService authService;
    private final RoomManager roomManager;
    private final HotelSettingsService hotelSettings;
    private ScheduledFuture<?> handshakeDeadline;
    private ScheduledFuture<?> authDeadline;
    private int messagesBeforeReady;
    private boolean movementAnnouncements;
    private long authWindowStartedAt;
    private int authRequestsInWindow;
    private static final int AUTH_REQUEST_LIMIT = 5;
    private static final long AUTH_WINDOW_NANOS = TimeUnit.SECONDS.toNanos(60);
    private static final long AUTH_TIMEOUT_SECONDS = 10;

    CoreChannelHandler(AppConfig config, ConnectionRegistry registry) {
        this(config, registry, null, null, HotelSettingsService.unavailable());
    }

    CoreChannelHandler(AppConfig config, ConnectionRegistry registry, AuthService authService) {
        this(config, registry, authService, null, HotelSettingsService.unavailable());
    }

    CoreChannelHandler(AppConfig config, ConnectionRegistry registry, AuthService authService, RoomManager roomManager) {
        this(config, registry, authService, roomManager, HotelSettingsService.unavailable());
    }

    CoreChannelHandler(AppConfig config, ConnectionRegistry registry, AuthService authService, RoomManager roomManager,
                       HotelSettingsService hotelSettings) {
        this.config = config;
        this.registry = registry;
        this.authService = authService;
        this.roomManager = roomManager;
        this.hotelSettings = hotelSettings;
        messageRateLimiter = new MessageTokenBucket(
                config.messageRatePerSecond(), config.messageRateBurst(), System.nanoTime());
    }

    @Override
    public void channelActive(ChannelHandlerContext ctx) throws Exception {
        Session session = session(ctx);
        LOG.atInfo().addKeyValue("event", "connection.accepted").addKeyValue("sessionId", session.id())
                .log("Habbux Core connection accepted");
        super.channelActive(ctx);
    }

    @Override
    public void userEventTriggered(ChannelHandlerContext ctx, Object event) throws Exception {
        if (event instanceof io.netty.handler.codec.http.websocketx.WebSocketServerProtocolHandler.HandshakeComplete) {
            Session session = session(ctx);
            if (!session.transition(Session.State.CONNECTED, Session.State.HANDSHAKING)) {
                closeProtocol(ctx, "invalid handshake state");
                return;
            }
            handshakeDeadline = ctx.executor().schedule(() -> {
                if (session.state() == Session.State.HANDSHAKING) {
                    registry.handshakeTimeout();
                    LOG.atWarn().addKeyValue("event", "protocol.handshake_timeout")
                            .addKeyValue("sessionId", session.id()).log("Habbux Core handshake expired");
                    sendErrorAndClose(ctx, ServerErrorCode.HANDSHAKE_TIMEOUT, 1008);
                }
            }, config.handshakeTimeoutMillis(), TimeUnit.MILLISECONDS);
        } else if (event instanceof IdleStateEvent) {
            LOG.atInfo().addKeyValue("event", "connection.idle_timeout")
                    .addKeyValue("sessionId", session(ctx).id()).log("Habbux Core connection idle timeout");
            ctx.close();
            return;
        }
        super.userEventTriggered(ctx, event);
    }

    @Override
    protected void channelRead0(ChannelHandlerContext ctx, WebSocketFrame webSocketFrame) {
        registry.receivedFrame();
        registry.receivedBytes(webSocketFrame.content().readableBytes());
        Session session = session(ctx);
        if (isApplicationState(session.state()) && !messageRateLimiter.tryAcquire(System.nanoTime())) {
            registry.rateLimitDisconnect();
            LOG.atWarn().addKeyValue("event", "protocol.rate_limit")
                    .addKeyValue("sessionId", session.id()).log("Habbux Core message rate exceeded");
            ctx.close();
            return;
        }
        if (!(webSocketFrame instanceof BinaryWebSocketFrame binary)) {
            registry.invalidFrame();
            closeProtocol(ctx, "binary messages required");
            return;
        }
        HabbuxFrame frame;
        try {
            frame = codec.decode(binary.content(), config.maxPayloadBytes());
        } catch (ProtocolException exception) {
            registry.invalidFrame();
            LOG.atWarn().addKeyValue("event", "protocol.violation")
                    .addKeyValue("sessionId", session(ctx).id())
                    .addKeyValue("category", exception.category())
                    .log("Habbux Core rejected a malformed frame");
            closeProtocol(ctx, 1002, "invalid frame");
            return;
        }
        CoreMessage message = CoreMessage.fromId(frame.messageId());
        boolean credentialFrame = message == CoreMessage.AUTH_LOGIN || message == CoreMessage.AUTH_REGISTER;
        if (credentialFrame) {
            binary.content().setZero(binary.content().readerIndex(), binary.content().readableBytes());
        }
        if ((session.state() == Session.State.CONNECTED || session.state() == Session.State.HANDSHAKING)
                && ++messagesBeforeReady > config.maxPreReadyMessages()) {
            if (credentialFrame) frame.clearPayload();
            registry.invalidFrame();
            registry.protocolViolation();
            sendErrorAndClose(ctx, ServerErrorCode.INVALID_STATE, 1008);
            return;
        }
        if (message == null) {
            registry.invalidFrame();
            registry.protocolViolation();
            sendErrorAndClose(ctx, ServerErrorCode.INVALID_STATE, 1008);
            return;
        }
        switch (message) {
            case CLIENT_HELLO -> handleHello(ctx, session, frame);
            case PING -> handlePing(ctx, session, frame);
            case CLIENT_DISCONNECT -> handleDisconnect(ctx, session, frame);
            case AUTH_LOGIN -> handleLogin(ctx, session, frame);
            case AUTH_REGISTER -> handleRegistration(ctx, session, frame);
            case AUTH_LOGOUT -> handleLogout(ctx, session, frame);
            case ROOM_JOIN, ROOM_JOIN_MOVEMENT -> handleRoomJoin(ctx, session, frame);
            case ROOM_LEAVE -> handleRoomLeave(ctx, session, frame);
            case ROOM_MOVE -> handleRoomMove(ctx, session, frame);
            case ROOM_CHAT -> handleRoomChat(ctx, session, frame);
            default -> {
                registry.invalidFrame();
                sendErrorAndClose(ctx, ServerErrorCode.INVALID_STATE, 1008);
            }
        }
    }

    private void handleHello(ChannelHandlerContext ctx, Session session, HabbuxFrame frame) {
        if (frame.payload().length != 0 || !session.transition(Session.State.HANDSHAKING, Session.State.READY)) {
            registry.invalidFrame();
            registry.protocolViolation();
            sendErrorAndClose(ctx, ServerErrorCode.INVALID_STATE, 1008);
            return;
        }
        cancelHandshakeDeadline();
        ByteBuffer id = ByteBuffer.allocate(16).putLong(session.id().getMostSignificantBits()).putLong(session.id().getLeastSignificantBits());
        if (writeFrame(ctx, new HabbuxFrame(FrameCodec.VERSION, CoreMessage.SERVER_HELLO.id(), 0, id.array()))) {
            LOG.atInfo().addKeyValue("event", "session.ready").addKeyValue("sessionId", session.id())
                    .log("Habbux Core session ready");
        }
    }

    private void handlePing(ChannelHandlerContext ctx, Session session, HabbuxFrame frame) {
        byte[] payload = frame.payload();
        if (!isApplicationState(session.state()) || payload.length != 4) {
            registry.invalidFrame();
            registry.protocolViolation();
            sendErrorAndClose(ctx, ServerErrorCode.INVALID_STATE, 1008);
            return;
        }
        writeFrame(ctx, new HabbuxFrame(FrameCodec.VERSION, CoreMessage.PONG.id(), 0, payload));
    }

    private void handleDisconnect(ChannelHandlerContext ctx, Session session, HabbuxFrame frame) {
        if (!isApplicationState(session.state()) || frame.payload().length != 0) {
            registry.invalidFrame();
            registry.protocolViolation();
            sendErrorAndClose(ctx, ServerErrorCode.INVALID_STATE, 1008);
            return;
        }
        ctx.writeAndFlush(new CloseWebSocketFrame(1000, "client disconnect"))
                .addListener(ChannelFutureListener.CLOSE);
    }

    private void handleLogin(ChannelHandlerContext ctx, Session session, HabbuxFrame frame) {
        byte[] payload = frame.payload();
        frame.clearPayload();
        if (!beginAuthentication(ctx, session)) {
            Arrays.fill(payload, (byte) 0);
            return;
        }
        AuthPayloadCodec.Login request;
        try {
            request = AuthPayloadCodec.decodeLogin(payload);
        } catch (AuthPayloadCodec.MalformedAuthPayloadException exception) {
            session.transition(Session.State.AUTHENTICATING, Session.State.READY);
            writeAuthFailure(ctx, AuthFailure.INVALID_REQUEST);
            return;
        }
        try (request) {
            startAuthentication(ctx, session, request.identifier(), null, request.takePassword(), false);
        }
    }

    private void handleRegistration(ChannelHandlerContext ctx, Session session, HabbuxFrame frame) {
        byte[] payload = frame.payload();
        frame.clearPayload();
        if (!beginAuthentication(ctx, session)) {
            Arrays.fill(payload, (byte) 0);
            return;
        }
        AuthPayloadCodec.Registration request;
        try {
            request = AuthPayloadCodec.decodeRegistration(payload);
        } catch (AuthPayloadCodec.MalformedAuthPayloadException exception) {
            session.transition(Session.State.AUTHENTICATING, Session.State.READY);
            writeAuthFailure(ctx, AuthFailure.INVALID_REQUEST);
            return;
        }
        try (request) {
            if (!hotelSettings.registrationsEnabled()) {
                session.transition(Session.State.AUTHENTICATING, Session.State.READY);
                writeAuthFailure(ctx, AuthFailure.REJECTED);
                return;
            }
            startAuthentication(ctx, session, request.username(), request.email(), request.takePassword(), true);
        }
    }

    private boolean beginAuthentication(ChannelHandlerContext ctx, Session session) {
        if (session.state() != Session.State.READY) {
            registry.invalidFrame();
            registry.protocolViolation();
            sendErrorAndClose(ctx, ServerErrorCode.INVALID_STATE, 1008);
            return false;
        }
        long now = System.nanoTime();
        if (authWindowStartedAt == 0 || now - authWindowStartedAt >= AUTH_WINDOW_NANOS) {
            authWindowStartedAt = now;
            authRequestsInWindow = 0;
        }
        if (authRequestsInWindow >= AUTH_REQUEST_LIMIT) {
            writeAuthFailure(ctx, AuthFailure.RATE_LIMITED);
            return false;
        }
        authRequestsInWindow++;
        if (!session.transition(Session.State.READY, Session.State.AUTHENTICATING)) {
            sendErrorAndClose(ctx, ServerErrorCode.INVALID_STATE, 1008);
            return false;
        }
        return true;
    }

    private void startAuthentication(ChannelHandlerContext ctx, Session session, String identifier, String email,
                                     char[] password, boolean registration) {
        if (authService == null) {
            Arrays.fill(password, '\0');
            session.transition(Session.State.AUTHENTICATING, Session.State.READY);
            writeAuthFailure(ctx, AuthFailure.UNAVAILABLE);
            return;
        }
        var operation = registration
                ? authService.register(identifier, email, password)
                : authService.login(identifier, password);
        authDeadline = ctx.executor().schedule(() -> {
            if (session.state() == Session.State.AUTHENTICATING && ctx.channel().isActive()) {
                LOG.atWarn().addKeyValue("event", "auth.timeout").addKeyValue("sessionId", session.id())
                        .log("Habbux authentication exceeded its deadline");
                writeAuthFailure(ctx, AuthFailure.UNAVAILABLE);
                ctx.close();
            }
        }, AUTH_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        operation.whenComplete((result, failure) -> {
            try {
                ctx.executor().execute(() -> completeAuthentication(ctx, session, result, failure));
            } catch (RejectedExecutionException ignored) {
                // The channel event loop is already shutting down; session cleanup owns final state.
            }
        });
    }

    private void completeAuthentication(ChannelHandlerContext ctx, Session session, AuthResult result, Throwable failure) {
        cancelAuthDeadline();
        if (!ctx.channel().isActive() || session.state() != Session.State.AUTHENTICATING) return;
        if (failure != null || result == null) result = AuthResult.failure(AuthFailure.UNAVAILABLE);
        if (!result.succeeded()) {
            session.transition(Session.State.AUTHENTICATING, Session.State.READY);
            writeAuthFailure(ctx, result.failure());
            LOG.atInfo().addKeyValue("event", "auth.failure")
                    .addKeyValue("category", result.failure().name().toLowerCase(java.util.Locale.ROOT))
                    .addKeyValue("sessionId", session.id()).log("Habbux authentication was rejected");
            return;
        }
        if (!session.authenticate(result.user())) return;
        writeFrame(ctx, new HabbuxFrame(FrameCodec.VERSION, CoreMessage.AUTH_SUCCESS.id(), 0,
                AuthPayloadCodec.encodeSuccess(result.user().id(), result.user().username())));
        LOG.atInfo().addKeyValue("event", "auth.success").addKeyValue("userId", result.user().id())
                .addKeyValue("sessionId", session.id()).log("Habbux user authenticated");
    }

    private void handleLogout(ChannelHandlerContext ctx, Session session, HabbuxFrame frame) {
        if (session.state() != Session.State.AUTHENTICATED || frame.payload().length != 0
                || !session.transition(Session.State.AUTHENTICATED, Session.State.READY)) {
            registry.invalidFrame();
            registry.protocolViolation();
            sendErrorAndClose(ctx, ServerErrorCode.INVALID_STATE, 1008);
            return;
        }
        detachRoom(session, roomClient(ctx), false);
        writeFrame(ctx, new HabbuxFrame(FrameCodec.VERSION, CoreMessage.AUTH_LOGOUT_SUCCESS.id(), 0, new byte[0]));
        LOG.atInfo().addKeyValue("event", "auth.logout").addKeyValue("sessionId", session.id())
                .log("Habbux user logged out");
    }

    private void handleRoomJoin(ChannelHandlerContext ctx, Session session, HabbuxFrame frame) {
        if (session.state() != Session.State.AUTHENTICATED) {
            registry.invalidFrame();
            registry.protocolViolation();
            sendErrorAndClose(ctx, ServerErrorCode.INVALID_STATE, 1008);
            return;
        }
        RoomId roomId;
        try { roomId = RoomPayloadCodec.decodeJoin(frame.payload()); }
        catch (RoomPayloadCodec.MalformedRoomPayloadException malformed) {
            registry.invalidFrame();
            registry.protocolViolation();
            sendErrorAndClose(ctx, ServerErrorCode.INVALID_STATE, 1008);
            return;
        }
        RoomClient client = roomClient(ctx);
        if (session.roomState() != Session.RoomState.NONE) {
            client.send(new RoomOutbound.JoinFailed(RoomOutbound.JoinFailure.ALREADY_IN_ROOM));
            return;
        }
        if (roomId.value() == Long.MAX_VALUE) {
            client.send(new RoomOutbound.JoinFailed(RoomOutbound.JoinFailure.MOVEMENT_SUPPORTED));
            return;
        }
        movementAnnouncements = frame.messageId() == CoreMessage.ROOM_JOIN_MOVEMENT.id();
        if (roomManager == null) {
            client.send(new RoomOutbound.JoinFailed(RoomOutbound.JoinFailure.UNAVAILABLE));
            return;
        }
        if (hotelSettings.maintenanceEnabled()) {
            client.send(new RoomOutbound.JoinFailed(RoomOutbound.JoinFailure.UNAVAILABLE));
            return;
        }
        RoomManager.JoinHandle handle = roomManager.join(roomId, session.id(), session.principal(), client);
        if (!session.beginRoomJoin(handle)) {
            handle.cancel();
            client.send(new RoomOutbound.JoinFailed(RoomOutbound.JoinFailure.ALREADY_IN_ROOM));
            handle.result().thenAccept(outcome -> {
                if (outcome == RoomRuntime.JoinOutcome.JOINED) roomManager.leave(roomId, session.id(), client, false);
            });
            return;
        }
        handle.result().whenComplete((outcome, failure) -> dispatchToEventLoop(ctx, () -> {
            boolean joined = failure == null && outcome == RoomRuntime.JoinOutcome.JOINED && ctx.channel().isActive();
            boolean membershipAccepted = session.completeRoomJoin(handle, joined);
            if (outcome == RoomRuntime.JoinOutcome.JOINED && !membershipAccepted) {
                roomManager.leave(roomId, session.id(), client, false);
            }
        }));
    }

    private void handleRoomLeave(ChannelHandlerContext ctx, Session session, HabbuxFrame frame) {
        if (session.state() != Session.State.AUTHENTICATED) {
            registry.invalidFrame();
            registry.protocolViolation();
            sendErrorAndClose(ctx, ServerErrorCode.INVALID_STATE, 1008);
            return;
        }
        try { RoomPayloadCodec.validateLeave(frame.payload()); }
        catch (RoomPayloadCodec.MalformedRoomPayloadException malformed) {
            registry.invalidFrame();
            registry.protocolViolation();
            sendErrorAndClose(ctx, ServerErrorCode.INVALID_STATE, 1008);
            return;
        }
        Session.RoomMembership membership = session.detachRoom();
        if (membership.roomId() == null || roomManager == null) {
            roomClient(ctx).send(new RoomOutbound.Left());
            return;
        }
        if (membership.joinHandle() != null) membership.joinHandle().cancel();
        roomManager.leave(membership.roomId(), session.id(), roomClient(ctx), true);
    }

    private void handleRoomMove(ChannelHandlerContext ctx, Session session, HabbuxFrame frame) {
        if (session.state() != Session.State.AUTHENTICATED) {
            registry.invalidFrame();
            registry.protocolViolation();
            sendErrorAndClose(ctx, ServerErrorCode.INVALID_STATE, 1008);
            return;
        }
        RoomPayloadCodec.Destination destination;
        try { destination = RoomPayloadCodec.decodeMove(frame.payload()); }
        catch (RoomPayloadCodec.MalformedRoomPayloadException malformed) {
            registry.invalidFrame();
            registry.protocolViolation();
            sendErrorAndClose(ctx, ServerErrorCode.INVALID_STATE, 1008);
            return;
        }
        RoomClient client = roomClient(ctx);
        RoomId roomId = session.roomId();
        if (session.roomState() != Session.RoomState.IN_ROOM || roomId == null || roomManager == null) {
            client.send(new RoomOutbound.ActionFailed(RoomOutbound.ActionFailure.NOT_IN_ROOM));
            return;
        }
        roomManager.move(roomId, session.id(), destination.x(), destination.y(), client);
    }

    private void handleRoomChat(ChannelHandlerContext ctx, Session session, HabbuxFrame frame) {
        if (session.state() != Session.State.AUTHENTICATED) {
            registry.invalidFrame();
            registry.protocolViolation();
            sendErrorAndClose(ctx, ServerErrorCode.INVALID_STATE, 1008);
            return;
        }
        String text;
        try { text = RoomPayloadCodec.decodeChat(frame.payload()); }
        catch (RoomPayloadCodec.MalformedRoomPayloadException malformed) {
            roomClient(ctx).send(new RoomOutbound.ActionFailed(RoomOutbound.ActionOperation.CHAT,
                    RoomOutbound.ActionFailure.INVALID_MESSAGE));
            return;
        }
        RoomClient client = roomClient(ctx);
        RoomId roomId = session.roomId();
        if (session.roomState() != Session.RoomState.IN_ROOM || roomId == null || roomManager == null) {
            client.send(new RoomOutbound.ActionFailed(RoomOutbound.ActionOperation.CHAT,
                    RoomOutbound.ActionFailure.NOT_IN_ROOM));
            return;
        }
        roomManager.chat(roomId, session.id(), text, client);
    }

    private void detachRoom(Session session, RoomClient client, boolean acknowledge) {
        Session.RoomMembership membership = session.detachRoom();
        if (membership.roomId() != null && roomManager != null) {
            roomManager.leave(membership.roomId(), session.id(), client, acknowledge);
        }
    }

    private RoomClient roomClient(ChannelHandlerContext ctx) {
        return message -> dispatchToEventLoop(ctx, () -> {
            if (!ctx.channel().isActive() || (message instanceof RoomOutbound.Step && !movementAnnouncements)) return;
            try { writeFrame(ctx, RoomPayloadCodec.encode(message)); }
            catch (RuntimeException invalid) {
                LOG.atError().addKeyValue("event", "room.outbound_invalid")
                        .addKeyValue("sessionId", session(ctx).id()).setCause(invalid)
                        .log("Room Engine produced an invalid outbound payload");
                ctx.close();
            }
        });
    }

    private static void dispatchToEventLoop(ChannelHandlerContext ctx, Runnable action) {
        if (ctx.executor().inEventLoop()) {
            action.run();
            return;
        }
        try { ctx.executor().execute(action); }
        catch (RejectedExecutionException ignored) { /* Channel/EventLoop shutdown owns cleanup. */ }
    }

    private void writeAuthFailure(ChannelHandlerContext ctx, AuthFailure failure) {
        writeFrame(ctx, new HabbuxFrame(FrameCodec.VERSION, CoreMessage.AUTH_FAILURE.id(), 0,
                new byte[] { (byte) failure.code() }));
    }

    private static boolean isApplicationState(Session.State state) {
        return state == Session.State.READY || state == Session.State.AUTHENTICATING
                || state == Session.State.AUTHENTICATED;
    }

    private boolean writeFrame(ChannelHandlerContext ctx, HabbuxFrame frame) {
        if (!ctx.channel().isWritable()) {
            closeForBackpressure(ctx);
            return false;
        }
        ByteBuf encoded = codec.encode(ctx.alloc(), frame, config.maxPayloadBytes());
        int encodedBytes = encoded.readableBytes();
        ctx.writeAndFlush(new BinaryWebSocketFrame(encoded)).addListener(future -> {
            if (future.isSuccess()) {
                registry.sentFrame();
                registry.sentBytes(encodedBytes);
            }
            else ctx.close();
        });
        return true;
    }

    private void sendErrorAndClose(ChannelHandlerContext ctx, ServerErrorCode error, int closeCode) {
        if (!ctx.channel().isWritable()) {
            closeForBackpressure(ctx);
            return;
        }
        byte[] payload = ByteBuffer.allocate(2).putShort((short) error.code()).array();
        ByteBuf encoded = codec.encode(ctx.alloc(), new HabbuxFrame(
                FrameCodec.VERSION, CoreMessage.SERVER_ERROR.id(), 0, payload), config.maxPayloadBytes());
        int encodedBytes = encoded.readableBytes();
        ctx.writeAndFlush(new BinaryWebSocketFrame(encoded))
                .addListener(future -> {
                    if (future.isSuccess()) {
                        registry.sentFrame();
                        registry.sentBytes(encodedBytes);
                    }
                    ctx.writeAndFlush(new CloseWebSocketFrame(closeCode, "protocol error"))
                            .addListener(ChannelFutureListener.CLOSE);
                });
    }

    private void closeProtocol(ChannelHandlerContext ctx, String reason) { closeProtocol(ctx, 1002, reason); }

    private void closeProtocol(ChannelHandlerContext ctx, int code, String reason) {
        registry.protocolViolation();
        LOG.atWarn().addKeyValue("event", "protocol.violation").addKeyValue("reason", reason)
                .addKeyValue("sessionId", session(ctx).id()).log("Habbux Core closed an invalid connection");
        ctx.writeAndFlush(new CloseWebSocketFrame(code, reason)).addListener(ChannelFutureListener.CLOSE);
    }

    private void closeForBackpressure(ChannelHandlerContext ctx) {
        registry.backpressureDisconnect();
        LOG.atWarn().addKeyValue("event", "connection.backpressure")
                .addKeyValue("sessionId", session(ctx).id())
                .log("Habbux Core closed a connection with a saturated outbound buffer");
        ctx.close();
    }

    private Session session(ChannelHandlerContext ctx) {
        Session session = ctx.channel().attr(CoreChannelInitializer.SESSION).get();
        if (session == null) throw new IllegalStateException("Missing connection session");
        return session;
    }

    private void cancelHandshakeDeadline() {
        if (handshakeDeadline != null) {
            handshakeDeadline.cancel(false);
            handshakeDeadline = null;
        }
    }

    private void cancelAuthDeadline() {
        if (authDeadline != null) {
            authDeadline.cancel(false);
            authDeadline = null;
        }
    }

    @Override
    public void channelInactive(ChannelHandlerContext ctx) throws Exception {
        cancelHandshakeDeadline();
        cancelAuthDeadline();
        Session session = session(ctx);
        detachRoom(session, ignored -> { }, false);
        registry.remove(session.id());
        LOG.atInfo().addKeyValue("event", "connection.closed").addKeyValue("sessionId", session.id())
                .log("Habbux Core connection closed");
        super.channelInactive(ctx);
    }

    @Override
    public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
        LOG.atError().addKeyValue("event", "connection.exception")
                .addKeyValue("sessionId", session(ctx).id()).setCause(cause)
                .log("Unexpected Habbux Core channel exception");
        ctx.close();
    }
}
