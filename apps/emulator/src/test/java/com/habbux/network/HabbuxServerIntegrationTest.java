package com.habbux.network;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.habbux.config.AppConfig;
import com.habbux.auth.AuthExecutor;
import com.habbux.auth.AuthFailure;
import com.habbux.auth.AuthService;
import com.habbux.persistence.DatabaseConfig;
import com.habbux.persistence.DatabasePool;
import com.habbux.protocol.CoreMessage;
import com.habbux.protocol.FrameCodec;
import com.habbux.protocol.HabbuxFrame;
import com.habbux.session.Session;
import com.habbux.security.Argon2idPasswordHasher;
import com.habbux.user.UserRepository;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import java.net.URI;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
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
            assertEquals(28, server.registry().metrics().bytesReceived());
            assertEquals(36, server.registry().metrics().bytesSent());
            assertEquals(1, server.registry().metrics().connectionsAccepted());
            assertEquals(1, server.registry().metrics().connectionsClosed());
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
            assertEquals(1, server.registry().metrics().handshakeTimeouts());
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
            assertEquals(1, server.registry().metrics().protocolViolations());
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

    @Test
    void unavailableAuthFailsSafelyAndEventLoopStillAnswersPing() throws Exception {
        HabbuxServer server = new HabbuxServer(config(10_000, 8));
        try (server; HttpClient client = HttpClient.newHttpClient()) {
            server.start();
            ClientListener listener = new ClientListener();
            WebSocket socket = client.newWebSocketBuilder().buildAsync(uri(server.localPort()), listener).get(5, TimeUnit.SECONDS);
            socket.sendBinary(encode(new HabbuxFrame(1, CoreMessage.CLIENT_HELLO.id(), 0, new byte[0])), true)
                    .get(5, TimeUnit.SECONDS);
            HabbuxFrame hello = decode(listener.nextBinary());
            Session session = server.registry().find(readSessionId(hello.payload()));
            assertNotNull(session);

            socket.sendBinary(encode(new HabbuxFrame(1, CoreMessage.AUTH_LOGIN.id(), 0, loginPayload("alice", "correct horse"))), true)
                    .get(5, TimeUnit.SECONDS);
            HabbuxFrame failure = decode(listener.nextBinary());
            assertEquals(CoreMessage.AUTH_FAILURE.id(), failure.messageId());
            assertEquals(4, Byte.toUnsignedInt(failure.payload()[0]));
            assertEquals(Session.State.READY, session.state());

            socket.sendBinary(encode(new HabbuxFrame(1, CoreMessage.PING.id(), 0, ByteBuffer.allocate(4).putInt(71).array())), true)
                    .get(5, TimeUnit.SECONDS);
            HabbuxFrame pong = decode(listener.nextBinary());
            assertEquals(CoreMessage.PONG.id(), pong.messageId());
            assertEquals(71, ByteBuffer.wrap(pong.payload()).getInt());
            socket.sendClose(1000, "test").get(5, TimeUnit.SECONDS);
            listener.awaitClosed();
            awaitZero(server);
        }
    }

    @Test
    void malformedAuthPayloadGetsBoundedFailureAndSessionCanDisconnect() throws Exception {
        HabbuxServer server = new HabbuxServer(config(10_000, 8));
        try (server; HttpClient client = HttpClient.newHttpClient()) {
            server.start();
            ClientListener listener = new ClientListener();
            WebSocket socket = client.newWebSocketBuilder().buildAsync(uri(server.localPort()), listener).get(5, TimeUnit.SECONDS);
            socket.sendBinary(encode(new HabbuxFrame(1, CoreMessage.CLIENT_HELLO.id(), 0, new byte[0])), true)
                    .get(5, TimeUnit.SECONDS);
            assertEquals(CoreMessage.SERVER_HELLO.id(), decode(listener.nextBinary()).messageId());
            byte[] malformed = ByteBuffer.allocate(5).putShort((short) 1).put((byte) 'a').putShort((short) 0).array();
            socket.sendBinary(encode(new HabbuxFrame(1, CoreMessage.AUTH_LOGIN.id(), 0, malformed)), true)
                    .get(5, TimeUnit.SECONDS);
            HabbuxFrame failure = decode(listener.nextBinary());
            assertEquals(CoreMessage.AUTH_FAILURE.id(), failure.messageId());
            assertEquals(1, Byte.toUnsignedInt(failure.payload()[0]));
            socket.sendBinary(encode(new HabbuxFrame(1, CoreMessage.CLIENT_DISCONNECT.id(), 0, new byte[0])), true)
                    .get(5, TimeUnit.SECONDS);
            listener.awaitClosed();
            awaitZero(server);
        }
    }

    @Test
    void limitsAuthenticationRequestsPerConnection() throws Exception {
        HabbuxServer server = new HabbuxServer(config(10_000, 8));
        try (server; HttpClient client = HttpClient.newHttpClient()) {
            server.start();
            ClientListener listener = new ClientListener();
            WebSocket socket = client.newWebSocketBuilder().buildAsync(uri(server.localPort()), listener)
                    .get(5, TimeUnit.SECONDS);
            socket.sendBinary(encode(new HabbuxFrame(1, CoreMessage.CLIENT_HELLO.id(), 0, new byte[0])), true)
                    .get(5, TimeUnit.SECONDS);
            assertEquals(CoreMessage.SERVER_HELLO.id(), decode(listener.nextBinary()).messageId());
            for (int attempt = 0; attempt < 5; attempt++) {
                socket.sendBinary(encode(new HabbuxFrame(1, CoreMessage.AUTH_LOGIN.id(), 0,
                        loginPayload("user_" + attempt, "CorrectHorse"))), true).get(5, TimeUnit.SECONDS);
                HabbuxFrame unavailable = decode(listener.nextBinary());
                assertEquals(CoreMessage.AUTH_FAILURE.id(), unavailable.messageId());
                assertEquals(4, Byte.toUnsignedInt(unavailable.payload()[0]));
            }
            socket.sendBinary(encode(new HabbuxFrame(1, CoreMessage.AUTH_LOGIN.id(), 0,
                    loginPayload("sixth_user", "CorrectHorse"))), true).get(5, TimeUnit.SECONDS);
            HabbuxFrame limited = decode(listener.nextBinary());
            assertEquals(CoreMessage.AUTH_FAILURE.id(), limited.messageId());
            assertEquals(3, Byte.toUnsignedInt(limited.payload()[0]));
            socket.sendClose(1000, "test").get(5, TimeUnit.SECONDS);
            listener.awaitClosed();
            awaitZero(server);
        }
    }

    @Test
    void authBeforeClientHelloIsRejectedWithoutStartingAuthentication() throws Exception {
        HabbuxServer server = new HabbuxServer(config(10_000, 8));
        try (server; HttpClient client = HttpClient.newHttpClient()) {
            server.start();
            ClientListener listener = new ClientListener();
            WebSocket socket = client.newWebSocketBuilder().buildAsync(uri(server.localPort()), listener).get(5, TimeUnit.SECONDS);
            socket.sendBinary(encode(new HabbuxFrame(1, CoreMessage.AUTH_LOGIN.id(), 0, loginPayload("alice", "password"))), true)
                    .get(5, TimeUnit.SECONDS);
            HabbuxFrame error = decode(listener.nextBinary());
            assertEquals(CoreMessage.SERVER_ERROR.id(), error.messageId());
            assertEquals(1, ByteBuffer.wrap(error.payload()).getShort());
            listener.awaitClosed();
            awaitZero(server);
        }
    }

    @Test
    void databaseOutageReturnsSafeFailureAndKeepsCoreEventLoopResponsive() throws Exception {
        int unavailablePort;
        try (ServerSocket reservation = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
            unavailablePort = reservation.getLocalPort();
        }
        DatabaseConfig databaseConfig = new DatabaseConfig("127.0.0.1", unavailablePort,
                "habbux_unavailable_test", "habbux_test", "local-test-only", 1, 1,
                500, 60_000, 1_800_000);
        try (DatabasePool database = new DatabasePool(databaseConfig);
             AuthExecutor executor = new AuthExecutor(1, 2)) {
            AuthService auth = new AuthService(new UserRepository(database.dataSource()), executor,
                    new Argon2idPasswordHasher());
            HabbuxServer server = new HabbuxServer(config(10_000, 8), auth, executor);
            try (server; HttpClient client = HttpClient.newHttpClient()) {
                server.start();
                ClientListener listener = new ClientListener();
                WebSocket socket = client.newWebSocketBuilder().buildAsync(uri(server.localPort()), listener)
                        .get(5, TimeUnit.SECONDS);
                socket.sendBinary(encode(new HabbuxFrame(1, CoreMessage.CLIENT_HELLO.id(), 0, new byte[0])), true)
                        .get(5, TimeUnit.SECONDS);
                assertEquals(CoreMessage.SERVER_HELLO.id(), decode(listener.nextBinary()).messageId());
                socket.sendBinary(encode(new HabbuxFrame(1, CoreMessage.AUTH_LOGIN.id(), 0,
                        loginPayload("missing_user", "CorrectHorse"))), true).get(5, TimeUnit.SECONDS);
                socket.sendBinary(encode(new HabbuxFrame(1, CoreMessage.PING.id(), 0,
                        ByteBuffer.allocate(4).putInt(92).array())), true).get(5, TimeUnit.SECONDS);
                boolean gotFailure = false;
                boolean gotPong = false;
                for (int index = 0; index < 2; index++) {
                    HabbuxFrame response = decode(listener.nextBinary());
                    if (response.messageId() == CoreMessage.AUTH_FAILURE.id()) {
                        assertEquals(AuthFailure.UNAVAILABLE.code(), Byte.toUnsignedInt(response.payload()[0]));
                        gotFailure = true;
                    } else if (response.messageId() == CoreMessage.PONG.id()) {
                        assertEquals(92, ByteBuffer.wrap(response.payload()).getInt());
                        gotPong = true;
                    }
                }
                assertTrue(gotFailure);
                assertTrue(gotPong);
                socket.sendClose(1000, "test").get(5, TimeUnit.SECONDS);
                listener.awaitClosed();
                awaitZero(server);
            }
        }
    }

    private static AppConfig config(int handshakeMillis, int maxConnections) {
        return new AppConfig("test", 1, 5_000, "127.0.0.1", 0, PAYLOAD_LIMIT, handshakeMillis, 30,
                maxConnections, 3, 30, 60, Set.of("http://localhost:5173"));
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

    private static byte[] loginPayload(String login, String password) {
        byte[] loginBytes = login.getBytes(StandardCharsets.UTF_8);
        byte[] passwordBytes = password.getBytes(StandardCharsets.UTF_8);
        return ByteBuffer.allocate(4 + loginBytes.length + passwordBytes.length)
                .putShort((short) loginBytes.length).put(loginBytes)
                .putShort((short) passwordBytes.length).put(passwordBytes).array();
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
