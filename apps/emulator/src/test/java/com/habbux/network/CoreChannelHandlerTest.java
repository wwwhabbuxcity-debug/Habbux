package com.habbux.network;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import com.habbux.config.AppConfig;
import com.habbux.protocol.CoreMessage;
import com.habbux.protocol.FrameCodec;
import com.habbux.protocol.HabbuxFrame;
import com.habbux.session.ConnectionRegistry;
import com.habbux.session.Session;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.UnpooledByteBufAllocator;
import io.netty.channel.WriteBufferWaterMark;
import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.websocketx.BinaryWebSocketFrame;
import java.util.Set;
import org.junit.jupiter.api.Test;

class CoreChannelHandlerTest {
    @Test
    void closesSlowConsumerBeforeOutboundResponsesCanAccumulate() {
        AppConfig config = new AppConfig("test", 1, 5_000, "127.0.0.1", 0, 65_536,
                10_000, 30, 1, 3, Set.of());
        ConnectionRegistry registry = new ConnectionRegistry(1);
        Session session = registry.tryConnect();
        session.transition(Session.State.CONNECTED, Session.State.HANDSHAKING);
        session.transition(Session.State.HANDSHAKING, Session.State.READY);

        EmbeddedChannel channel = new EmbeddedChannel();
        channel.config().setWriteBufferWaterMark(new WriteBufferWaterMark(0, 1));
        channel.attr(CoreChannelInitializer.SESSION).set(session);
        channel.pipeline().addLast(new CoreChannelHandler(config, registry));

        try {
            channel.writeInbound(ping());
            assertFalse(channel.isWritable(), "the first unconsumed PONG must cross the test watermark");
            channel.writeInbound(ping());
            assertFalse(channel.isActive(), "the server must close instead of enqueueing another PONG");
            assertEquals(0, registry.activeConnections());
            assertEquals(0, registry.activeSessions());
            assertEquals(Session.State.DISCONNECTED, session.state());
        } finally {
            channel.finishAndReleaseAll();
        }
    }

    private static BinaryWebSocketFrame ping() {
        ByteBuf encoded = new FrameCodec().encode(UnpooledByteBufAllocator.DEFAULT,
                new HabbuxFrame(FrameCodec.VERSION, CoreMessage.PING.id(), 0, new byte[] { 0, 0, 0, 1 }),
                65_536);
        return new BinaryWebSocketFrame(encoded);
    }
}
