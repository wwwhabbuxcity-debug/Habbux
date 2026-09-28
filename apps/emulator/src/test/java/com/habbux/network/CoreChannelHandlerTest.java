package com.habbux.network;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import java.util.Set;
import org.junit.jupiter.api.Test;

class CoreChannelHandlerTest {
    @Test
    void closesSlowConsumerBeforeOutboundResponsesCanAccumulate() {
        AppConfig config = new AppConfig("test", 1, 5_000, "127.0.0.1", 0, 65_536,
                10_000, 30, 1, 3, 30, 60, Set.of());
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
            assertEquals(1, registry.metrics().backpressureDisconnects());
        } finally {
            channel.finishAndReleaseAll();
        }
    }

    @Test
    void disconnectsConnectionAfterPerChannelMessageBurstIsExhausted() {
        AppConfig config = new AppConfig("test", 1, 5_000, "127.0.0.1", 0, 65_536,
                10_000, 30, 1, 3, 1, 2, Set.of());
        ConnectionRegistry registry = new ConnectionRegistry(1);
        Session session = registry.tryConnect();
        session.transition(Session.State.CONNECTED, Session.State.HANDSHAKING);
        session.transition(Session.State.HANDSHAKING, Session.State.READY);

        EmbeddedChannel channel = new EmbeddedChannel();
        channel.attr(CoreChannelInitializer.SESSION).set(session);
        channel.pipeline().addLast(new CoreChannelHandler(config, registry));
        try {
            channel.writeInbound(ping());
            channel.writeOutbound();
            channel.writeInbound(ping());
            channel.writeOutbound();
            channel.writeInbound(ping());

            assertFalse(channel.isActive(), "exceeding the connection burst must close the channel");
            assertEquals(1, registry.metrics().rateLimitDisconnects());
            assertEquals(3, registry.metrics().framesReceived());
            assertEquals(2, registry.metrics().framesSent());
            assertEquals(0, registry.metrics().activeConnections());
            assertEquals(0, registry.metrics().activeSessions());
        } finally {
            channel.finishAndReleaseAll();
        }
    }

    @Test
    void tokenBucketRefillsAtConfiguredRateAndCapsTheBurst() {
        MessageTokenBucket bucket = new MessageTokenBucket(2, 2, 0);

        assertTrue(bucket.tryAcquire(0));
        assertTrue(bucket.tryAcquire(0));
        assertFalse(bucket.tryAcquire(0));
        assertTrue(bucket.tryAcquire(500_000_000));
        assertFalse(bucket.tryAcquire(500_000_000));
        assertTrue(bucket.tryAcquire(1_000_000_000));
        assertTrue(bucket.tryAcquire(10_000_000_000L));
        assertTrue(bucket.tryAcquire(10_000_000_000L));
        assertFalse(bucket.tryAcquire(10_000_000_000L), "refill remains bounded by the burst capacity");
    }

    @Test
    void countsNonBinaryFrameAsOneProtocolViolation() {
        AppConfig config = new AppConfig("test", 1, 5_000, "127.0.0.1", 0, 65_536,
                10_000, 30, 1, 3, 30, 60, Set.of());
        ConnectionRegistry registry = new ConnectionRegistry(1);
        Session session = registry.tryConnect();
        session.transition(Session.State.CONNECTED, Session.State.HANDSHAKING);
        session.transition(Session.State.HANDSHAKING, Session.State.READY);

        EmbeddedChannel channel = new EmbeddedChannel();
        channel.attr(CoreChannelInitializer.SESSION).set(session);
        channel.pipeline().addLast(new CoreChannelHandler(config, registry));
        try {
            channel.writeInbound(new TextWebSocketFrame("not a protocol frame"));

            assertFalse(channel.isActive());
            assertEquals(1, registry.metrics().framesReceived());
            assertEquals("not a protocol frame".length(), registry.metrics().bytesReceived());
            assertEquals(1, registry.metrics().invalidFrames());
            assertEquals(1, registry.metrics().protocolViolations());
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
