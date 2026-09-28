package com.habbux.network;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.habbux.config.AppConfig;
import com.habbux.protocol.CoreMessage;
import com.habbux.protocol.FrameCodec;
import com.habbux.protocol.HabbuxFrame;
import com.habbux.session.Session;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

@Timeout(30)
class HabbuxServerIntegrationTest {
    private static final FrameCodec CODEC = new FrameCodec();
    private static final int PAYLOAD_LIMIT = 65_536;

    @Test
    void connectsHandshakesPingsDisconnectsAndCleansSession() throws Exception {
        HabbuxServer server = new HabbuxServer(config(10_000, 256));
        try (server; HttpClient client = HttpClient.newHttpClient()) {
            server.start();
            ClientListener listener = new ClientListener();
            WebSocket socket = client.newWebSocketBuilder().connectTimeout(Duration.ofSeconds(5))
                    .buildAsync(uri(server.localPort()), listener).get(5, TimeUnit.SECONDS);
            socket.sendBinary(encode(new HabbuxFrame(1, CoreMessage.CLIENT_HELLO.id(), 0, new byte[0])), true)
                    .get(5, TimeUnit.SECONDS);
            HabbuxFrame welcome = decode(listener.nextBinary());
            assertEquals(CoreMessage.SERVER_HELLO.id(), welcome.messageId());
            assertEquals(16, welcome.payload().length);
            assertEquals(1, server.registry().activeSessions());
            Session session = server.registry().find(readSessionId(welcome.payload()));
            assertNotNull(session);
            assertEquals(4, session.id().version());
            assertEquals(2, session.id().variant());
            assertEquals(Session.State.READY, session.state());

            byte[] sequence = ByteBuffer.allocate(4).putInt(42).array();
            socket.sendBinary(encode(new HabbuxFrame(1, CoreMessage.PING.id(), 0, sequence)), true)
                    .get(5, TimeUnit.SECONDS);
            HabbuxFrame pong = decode(listener.nextBinary());
            assertEquals(CoreMessage.PONG.id(), pong.messageId());
            assertEquals(42, ByteBuffer.wrap(pong.payload()).getInt());

            socket.sendBinary(encode(new HabbuxFrame(1, CoreMessage.CLIENT_DISCONNECT.id(), 0, new byte[0])), true)
                    .get(5, TimeUnit.SECONDS);
            listener.awaitClosed();
            awaitZero(server);
            assertEquals(0, server.registry().activeConnections());
            assertEquals(0, server.registry().activeSessions());
            assertEquals(3, server.registry().framesReceived());
            assertEquals(2, server.registry().framesSent());
        }
    }

    @Test
    void boundedSimultaneousConnectionsDoNotLeaveOrphanSessions() throws Exception {
        HabbuxServer server = new HabbuxServer(config(10_000, 32));
        try (server; HttpClient client = HttpClient.newHttpClient()) {
            server.start();
            List<ClientListener> listeners = new ArrayList<>();
            List<CompletableFuture<WebSocket>> connections = new ArrayList<>();
            for (int i = 0; i < 24; i++) {
                ClientListener listener = new ClientListener();
                listeners.add(listener);
                connections.add(client.newWebSocketBuilder().buildAsync(uri(server.localPort()), listener));
            }
            CompletableFuture.allOf(connections.toArray(CompletableFuture[]::new)).get(10, TimeUnit.SECONDS);
            List<WebSocket> sockets = connections.stream().map(CompletableFuture::join).toList();
            List<CompletableFuture<WebSocket>> hellos = new ArrayList<>();
            for (WebSocket socket : sockets) {
                hellos.add(socket.sendBinary(encode(new HabbuxFrame(1, CoreMessage.CLIENT_HELLO.id(), 0, new byte[0])), true));
            }
            CompletableFuture.allOf(hellos.toArray(CompletableFuture[]::new)).get(5, TimeUnit.SECONDS);
            for (ClientListener listener : listeners) assertEquals(CoreMessage.SERVER_HELLO.id(), decode(listener.nextBinary()).messageId());
            assertEquals(24, server.registry().activeSessions());
            List<CompletableFuture<WebSocket>> closes = new ArrayList<>();
            for (WebSocket socket : sockets) closes.add(socket.sendClose(1000, "test"));
            CompletableFuture.allOf(closes.toArray(CompletableFuture[]::new)).get(5, TimeUnit.SECONDS);
            awaitZero(server);
            assertEquals(0, server.registry().activeSessions());
            assertEquals(0, server.registry().activeConnections());
        }
    }

    @Test
    void handshakeTimeoutSendsStableErrorAndCleansSession() throws Exception {
        HabbuxServer server = new HabbuxServer(config(250, 8));
        try (server; HttpClient client = HttpClient.newHttpClient()) {
            server.start();
            ClientListener listener = new ClientListener();
            client.newWebSocketBuilder().buildAsync(uri(server.localPort()), listener).get(5, TimeUnit.SECONDS);
            HabbuxFrame error = decode(listener.nextBinary());
            assertEquals(CoreMessage.SERVER_ERROR.id(), error.messageId());
            assertEquals(2, ByteBuffer.wrap(error.payload()).getShort());
            listener.awaitClosed();
            awaitZero(server);
            assertEquals(0, server.registry().activeSessions());
        }
    }

    @Test
    void preHandshakePingIsRejectedWithoutCreatingAnAuthenticatedUser() throws Exception {
        HabbuxServer server = new HabbuxServer(config(10_000, 8));
        try (server; HttpClient client = HttpClient.newHttpClient()) {
            server.start();
            ClientListener listener = new ClientListener();
            WebSocket socket = client.newWebSocketBuilder().buildAsync(uri(server.localPort()), listener).get(5, TimeUnit.SECONDS);
            socket.sendBinary(encode(new HabbuxFrame(1, CoreMessage.PING.id(), 0, ByteBuffer.allocate(4).putInt(1).array())), true)
                    .get(5, TimeUnit.SECONDS);
            HabbuxFrame error = decode(listener.nextBinary());
            assertEquals(CoreMessage.SERVER_ERROR.id(), error.messageId());
            assertEquals(1, ByteBuffer.wrap(error.payload()).getShort());
            listener.awaitClosed();
            awaitZero(server);
            assertEquals(1, server.registry().invalidFrames());
            assertEquals(0, server.registry().activeSessions());
        }
    }

    @Test
    void rejectsBrowserOriginOutsideConfiguredAllowlist() throws Exception {
        HabbuxServer server = new HabbuxServer(config(10_000, 8));
        try (server; HttpClient client = HttpClient.newHttpClient()) {
            server.start();
            var rejected = client.newWebSocketBuilder().header("Origin", "https://untrusted.example")
                    .buildAsync(uri(server.localPort()), new ClientListener());
            assertThrows(ExecutionException.class, () -> rejected.get(5, TimeUnit.SECONDS));
            awaitZero(server);
            assertEquals(0, server.registry().activeSessions());
            assertEquals(1, server.registry().rejectedConnections());
        }
    }

    @Test
    void serverShutdownClosesLiveChannelsAndRemovesTheirSessions() throws Exception {
        HabbuxServer server = new HabbuxServer(config(10_000, 8));
        try (server; HttpClient client = HttpClient.newHttpClient()) {
            server.start();
            ClientListener listener = new ClientListener();
            WebSocket socket = client.newWebSocketBuilder().buildAsync(uri(server.localPort()), listener).get(5, TimeUnit.SECONDS);
            socket.sendBinary(encode(new HabbuxFrame(1, CoreMessage.CLIENT_HELLO.id(), 0, new byte[0])), true)
                    .get(5, TimeUnit.SECONDS);
            assertEquals(CoreMessage.SERVER_HELLO.id(), decode(listener.nextBinary()).messageId());
            assertEquals(1, server.registry().activeSessions());
            server.close();
            listener.awaitClosed();
            assertEquals(0, server.registry().activeConnections());
            assertEquals(0, server.registry().activeSessions());
        }
    }

    private static AppConfig config(int handshakeMillis, int maxConnections) {
        return new AppConfig("test", 1, 5_000, "127.0.0.1", 0, PAYLOAD_LIMIT, handshakeMillis, 30,
                maxConnections, 3, Set.of("http://localhost:5173"));
    }

    private static URI uri(int port) { return URI.create("ws://127.0.0.1:" + port + "/ws"); }

    private static ByteBuffer encode(HabbuxFrame frame) {
        ByteBuf bytes = CODEC.encode(UnpooledByteBufAllocatorHolder.ALLOCATOR, frame, PAYLOAD_LIMIT);
        try {
            byte[] copy = new byte[bytes.readableBytes()];
            bytes.getBytes(bytes.readerIndex(), copy);
            return ByteBuffer.wrap(copy);
        } finally {
            bytes.release();
        }
    }

    private static HabbuxFrame decode(ByteBuffer data) throws Exception {
        ByteBuf bytes = Unpooled.wrappedBuffer(data);
        try { return CODEC.decode(bytes, PAYLOAD_LIMIT); }
        finally { bytes.release(); }
    }

    private static java.util.UUID readSessionId(byte[] payload) {
        ByteBuffer value = ByteBuffer.wrap(payload);
        return new java.util.UUID(value.getLong(), value.getLong());
    }

    private static void awaitZero(HabbuxServer server) throws InterruptedException, TimeoutException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        while (server.registry().activeConnections() != 0 && System.nanoTime() < deadline) Thread.sleep(5);
        assertTrue(server.registry().activeConnections() == 0, "server should remove every closed session");
    }

    private static final class ClientListener implements WebSocket.Listener {
        private final LinkedBlockingQueue<ByteBuffer> messages = new LinkedBlockingQueue<>();
        private final CompletableFuture<Void> closed = new CompletableFuture<>();
        private volatile Throwable failure;

        @Override public void onOpen(WebSocket webSocket) { webSocket.request(1); }

        @Override
        public java.util.concurrent.CompletionStage<?> onBinary(WebSocket webSocket, ByteBuffer data, boolean last) {
            byte[] copy = new byte[data.remaining()];
            data.get(copy);
            messages.offer(ByteBuffer.wrap(copy));
            webSocket.request(1);
            return CompletableFuture.completedFuture(null);
        }

        @Override public java.util.concurrent.CompletionStage<?> onClose(WebSocket webSocket, int statusCode, String reason) {
            closed.complete(null);
            return CompletableFuture.completedFuture(null);
        }

        @Override public void onError(WebSocket webSocket, Throwable error) { failure = error; closed.completeExceptionally(error); }

        ByteBuffer nextBinary() throws Exception {
            ByteBuffer value = messages.poll(5, TimeUnit.SECONDS);
            if (value == null) throw new TimeoutException("Timed out waiting for binary protocol message");
            if (failure != null) throw new ExecutionException(failure);
            return value;
        }

        void awaitClosed() throws Exception { closed.get(5, TimeUnit.SECONDS); }
    }

    private static final class UnpooledByteBufAllocatorHolder {
        private static final io.netty.buffer.ByteBufAllocator ALLOCATOR = io.netty.buffer.UnpooledByteBufAllocator.DEFAULT;
    }
}
