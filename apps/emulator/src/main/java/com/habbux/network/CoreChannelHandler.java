package com.habbux.network;

import com.habbux.config.AppConfig;
import com.habbux.protocol.CoreMessage;
import com.habbux.protocol.FrameCodec;
import com.habbux.protocol.HabbuxFrame;
import com.habbux.protocol.ProtocolException;
import com.habbux.protocol.ServerErrorCode;
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
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

final class CoreChannelHandler extends SimpleChannelInboundHandler<WebSocketFrame> {
    static final int HEADER_BYTES = FrameCodec.HEADER_BYTES;
    private static final Logger LOG = LoggerFactory.getLogger(CoreChannelHandler.class);
    private final AppConfig config;
    private final ConnectionRegistry registry;
    private final FrameCodec codec = new FrameCodec();
    private ScheduledFuture<?> handshakeDeadline;
    private int messagesBeforeReady;

    CoreChannelHandler(AppConfig config, ConnectionRegistry registry) {
        this.config = config;
        this.registry = registry;
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
        registry.receivedFrame();
        CoreMessage message = CoreMessage.fromId(frame.messageId());
        Session session = session(ctx);
        if (session.state() != Session.State.READY && ++messagesBeforeReady > config.maxPreReadyMessages()) {
            registry.invalidFrame();
            sendErrorAndClose(ctx, ServerErrorCode.INVALID_STATE, 1008);
            return;
        }
        switch (message) {
            case CLIENT_HELLO -> handleHello(ctx, session, frame);
            case PING -> handlePing(ctx, session, frame);
            case CLIENT_DISCONNECT -> handleDisconnect(ctx, session, frame);
            default -> {
                registry.invalidFrame();
                sendErrorAndClose(ctx, ServerErrorCode.INVALID_STATE, 1008);
            }
        }
    }

    private void handleHello(ChannelHandlerContext ctx, Session session, HabbuxFrame frame) {
        if (frame.payload().length != 0 || !session.transition(Session.State.HANDSHAKING, Session.State.READY)) {
            registry.invalidFrame();
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
        if (session.state() != Session.State.READY || payload.length != 4) {
            registry.invalidFrame();
            sendErrorAndClose(ctx, ServerErrorCode.INVALID_STATE, 1008);
            return;
        }
        writeFrame(ctx, new HabbuxFrame(FrameCodec.VERSION, CoreMessage.PONG.id(), 0, payload));
    }

    private void handleDisconnect(ChannelHandlerContext ctx, Session session, HabbuxFrame frame) {
        if (session.state() != Session.State.READY || frame.payload().length != 0) {
            registry.invalidFrame();
            sendErrorAndClose(ctx, ServerErrorCode.INVALID_STATE, 1008);
            return;
        }
        ctx.writeAndFlush(new CloseWebSocketFrame(1000, "client disconnect"))
                .addListener(ChannelFutureListener.CLOSE);
    }

    private boolean writeFrame(ChannelHandlerContext ctx, HabbuxFrame frame) {
        if (!ctx.channel().isWritable()) {
            closeForBackpressure(ctx);
            return false;
        }
        ByteBuf encoded = codec.encode(ctx.alloc(), frame, config.maxPayloadBytes());
        ctx.writeAndFlush(new BinaryWebSocketFrame(encoded)).addListener(future -> {
            if (future.isSuccess()) registry.sentFrame();
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
        ctx.writeAndFlush(new BinaryWebSocketFrame(encoded))
                .addListener(future -> {
                    if (future.isSuccess()) registry.sentFrame();
                    ctx.writeAndFlush(new CloseWebSocketFrame(closeCode, "protocol error"))
                            .addListener(ChannelFutureListener.CLOSE);
                });
    }

    private void closeProtocol(ChannelHandlerContext ctx, String reason) { closeProtocol(ctx, 1002, reason); }

    private void closeProtocol(ChannelHandlerContext ctx, int code, String reason) {
        LOG.atWarn().addKeyValue("event", "protocol.violation").addKeyValue("reason", reason)
                .addKeyValue("sessionId", session(ctx).id()).log("Habbux Core closed an invalid connection");
        ctx.writeAndFlush(new CloseWebSocketFrame(code, reason)).addListener(ChannelFutureListener.CLOSE);
    }

    private void closeForBackpressure(ChannelHandlerContext ctx) {
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

    @Override
    public void channelInactive(ChannelHandlerContext ctx) throws Exception {
        cancelHandshakeDeadline();
        Session session = session(ctx);
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
