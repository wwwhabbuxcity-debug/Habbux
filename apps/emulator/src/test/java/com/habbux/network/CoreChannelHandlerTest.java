package com.habbux.network;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.habbux.config.AppConfig;
import com.habbux.protocol.CoreMessage;
import com.habbux.protocol.FrameCodec;
import com.habbux.protocol.HabbuxFrame;
import com.habbux.session.ConnectionRegistry;
import com.habbux.session.Session;
import com.habbux.room.RoomConfig;
import com.habbux.room.RoomGridDefinition;
import com.habbux.room.RoomId;
import com.habbux.room.RoomManager;
import com.habbux.room.RoomMetadata;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.UnpooledByteBufAllocator;
import io.netty.channel.WriteBufferWaterMark;
import io.netty.channel.embedded.EmbeddedChannel;
import io.netty.handler.codec.http.websocketx.BinaryWebSocketFrame;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;
import java.util.Set;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.concurrent.TimeUnit;
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

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    @org.junit.jupiter.api.Timeout(8)
    void authenticatedSessionJoinsReceivesSnapshotAndLeaveRemovesPresence(boolean announced) throws Exception {
        byte[] cells = new byte[9];
        Arrays.fill(cells, (byte) 1);
        Instant now = Instant.now();
        RoomMetadata room = new RoomMetadata(new RoomId(71), 1, "Wire test", "", 9,
                new RoomGridDefinition(3, 3, cells, 0, 0), now, now);
        RoomManager rooms = new RoomManager(id -> java.util.Optional.of(room),
                new RoomConfig(1, 8, 32, 8, 2, 10_000, 8, 8));
        ConnectionRegistry registry = new ConnectionRegistry(1);
        Session session = registry.tryConnect();
        session.transition(Session.State.CONNECTED, Session.State.HANDSHAKING);
        session.transition(Session.State.HANDSHAKING, Session.State.READY);
        session.transition(Session.State.READY, Session.State.AUTHENTICATING);
        session.authenticate(new com.habbux.user.UserIdentity(9, "alice"));
        EmbeddedChannel channel = new EmbeddedChannel();
        channel.attr(CoreChannelInitializer.SESSION).set(session);
        channel.pipeline().addLast(new CoreChannelHandler(
                new AppConfig("test", 1, 5_000, "127.0.0.1", 0, 65_536, 10_000, 30, 1, 3, 30, 60, Set.of()),
                registry, null, rooms));
        try {
            channel.writeInbound(roomRequest(CoreMessage.ROOM_JOIN, java.nio.ByteBuffer.allocate(8).putLong(Long.MAX_VALUE).array()));
            HabbuxFrame capability = awaitOutbound(channel);
            assertEquals(CoreMessage.ROOM_JOIN_FAILURE.id(), capability.messageId());
            assertArrayEquals(new byte[] {5}, capability.payload());
            assertEquals(Session.RoomState.NONE, session.roomState());
            assertEquals(0, rooms.activeRoom(room.id()).map(com.habbux.room.RoomRuntime::presenceCount).orElse(0));
            channel.writeInbound(roomRequest(announced ? CoreMessage.ROOM_JOIN_MOVEMENT : CoreMessage.ROOM_JOIN,
                    java.nio.ByteBuffer.allocate(8).putLong(room.id().value()).array()));
            assertEquals(CoreMessage.ROOM_JOIN_SUCCESS.id(), awaitOutbound(channel).messageId());
            HabbuxFrame snapshot = awaitOutbound(channel);
            assertEquals(CoreMessage.ROOM_SNAPSHOT.id(), snapshot.messageId());
            awaitRoomState(channel, session, Session.RoomState.IN_ROOM);
            assertEquals(Session.RoomState.IN_ROOM, session.roomState());
            assertEquals(1, rooms.activeRoom(room.id()).orElseThrow().presenceCount());

            channel.writeInbound(roomRequest(CoreMessage.ROOM_MOVE, new byte[] {2, 0}));
            for (int expectedX = 1; expectedX <= 2; expectedX++) {
                if (announced) {
                    HabbuxFrame step = awaitOutbound(channel);
                    assertEquals(CoreMessage.ROOM_USER_STEP.id(), step.messageId());
                    assertEquals(26, step.payload().length);
                }
                HabbuxFrame position = awaitOutbound(channel);
                assertEquals(CoreMessage.ROOM_USER_POSITION.id(), position.messageId());
                java.nio.ByteBuffer payload = java.nio.ByteBuffer.wrap(position.payload());
                assertEquals(9, payload.getLong());
                assertEquals(expectedX, Byte.toUnsignedInt(payload.get()));
                assertEquals(0, Byte.toUnsignedInt(payload.get()));
                assertEquals(0, Byte.toUnsignedInt(payload.get()));
            }

            byte[] chatText = "Oi 🏠".getBytes(java.nio.charset.StandardCharsets.UTF_8);
            byte[] chatPayload = java.nio.ByteBuffer.allocate(2 + chatText.length)
                    .putShort((short) chatText.length).put(chatText).array();
            channel.writeInbound(roomRequest(CoreMessage.ROOM_CHAT, chatPayload));
            HabbuxFrame chat = awaitOutbound(channel);
            assertEquals(CoreMessage.ROOM_USER_CHAT.id(), chat.messageId());
            java.nio.ByteBuffer chatBody = java.nio.ByteBuffer.wrap(chat.payload());
            assertEquals(9, chatBody.getLong());
            int textLength = Short.toUnsignedInt(chatBody.getShort());
            byte[] echoed = new byte[textLength];
            chatBody.get(echoed);
            assertEquals("Oi 🏠", new String(echoed, java.nio.charset.StandardCharsets.UTF_8));

            channel.writeInbound(roomRequest(CoreMessage.ROOM_LEAVE, new byte[0]));
            assertEquals(CoreMessage.ROOM_LEAVE_SUCCESS.id(), awaitOutbound(channel).messageId());
            awaitRoomState(channel, session, Session.RoomState.NONE);
            assertEquals(Session.RoomState.NONE, session.roomState());
            assertEquals(0, rooms.activeRoom(room.id()).orElseThrow().presenceCount());
        } finally {
            channel.finishAndReleaseAll();
            assertTrue(rooms.close(Duration.ofSeconds(5)));
        }
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

    private static BinaryWebSocketFrame roomRequest(CoreMessage message, byte[] payload) {
        ByteBuf encoded = new FrameCodec().encode(UnpooledByteBufAllocator.DEFAULT,
                new HabbuxFrame(FrameCodec.VERSION, message.id(), 0, payload), 65_536);
        return new BinaryWebSocketFrame(encoded);
    }

    private static HabbuxFrame awaitOutbound(EmbeddedChannel channel) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        while (System.nanoTime() < deadline) {
            channel.runPendingTasks();
            Object message = channel.readOutbound();
            if (message instanceof BinaryWebSocketFrame frame) {
                try { return new FrameCodec().decode(frame.content(), 65_536); }
                finally { frame.release(); }
            }
            Thread.sleep(1);
        }
        throw new AssertionError("timed out waiting for room protocol response");
    }

    private static void awaitRoomState(EmbeddedChannel channel, Session session, Session.RoomState expected) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        while (System.nanoTime() < deadline) {
            channel.runPendingTasks();
            if (session.roomState() == expected) return;
            Thread.sleep(1);
        }
        throw new AssertionError("timed out waiting for session room state " + expected);
    }
}
