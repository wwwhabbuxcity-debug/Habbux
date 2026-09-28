package com.habbux.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.habbux.auth.AuthExecutor;
import com.habbux.auth.AuthService;
import com.habbux.config.AppConfig;
import com.habbux.network.HabbuxServer;
import com.habbux.protocol.CoreMessage;
import com.habbux.protocol.FrameCodec;
import com.habbux.protocol.HabbuxFrame;
import com.habbux.security.Argon2idPasswordHasher;
import com.habbux.session.Session;
import com.habbux.user.UserIdentity;
import com.habbux.user.UserRepository;
import com.habbux.user.ValidatedUser;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import io.netty.buffer.UnpooledByteBufAllocator;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

/** Full loopback Auth protocol test, fail-closed to the dedicated Habbux test database. */
class AuthPostgresEndToEndIntegrationTest {
    private static final FrameCodec CODEC = new FrameCodec();
    private static final int MAX_PAYLOAD = 65_536;

    @Test
    @Timeout(60)
    void fullAuthFlowAllowsMultipleSessionsAndDoesNotResurrectDisconnectedSession() throws Exception {
        Map<String, String> env = System.getenv();
        String host = env.get("HABBUX_TEST_POSTGRES_HOST");
        if (host == null || env.get("HABBUX_TEST_POSTGRES_DB") == null) {
            Assumptions.abort("Habbux PostgreSQL integration variables are not configured");
        }
        Assumptions.assumeTrue(host.equals("127.0.0.1") || host.equals("localhost"),
                "PostgreSQL integration is limited to loopback");
        Assumptions.assumeTrue(PostgresUserRepositoryIntegrationTest.ALLOWED_DATABASE.equals(
                env.get("HABBUX_TEST_POSTGRES_DB")), "PostgreSQL integration requires the exact isolated database name");

        DatabaseConfig migrationConfig = PostgresUserRepositoryIntegrationTest.config(env,
                "HABBUX_TEST_POSTGRES_MIGRATION_USER", "HABBUX_TEST_POSTGRES_MIGRATION_PASSWORD");
        DatabaseConfig applicationConfig = PostgresUserRepositoryIntegrationTest.config(env,
                "HABBUX_TEST_POSTGRES_USER", "HABBUX_TEST_POSTGRES_PASSWORD");
        try (DatabasePool migrationPool = new DatabasePool(migrationConfig);
             DatabasePool applicationPool = new DatabasePool(applicationConfig)) {
            PostgresUserRepositoryIntegrationTest.verifyExpectedDatabase(migrationPool);
            Flyway.configure().dataSource(migrationPool.dataSource())
                    .locations(PostgresUserRepositoryIntegrationTest.migrationLocation())
                    .cleanDisabled(true).load().migrate();
            PostgresUserRepositoryIntegrationTest.grantRuntimePrivileges(migrationPool);
            PostgresUserRepositoryIntegrationTest.clearOnlyDedicatedTestTables(migrationPool);

            UserRepository users = new UserRepository(applicationPool.dataSource());
            Argon2idPasswordHasher hasher = new Argon2idPasswordHasher();
            UserIdentity original = users.create(ValidatedUser.create("Auth_User", "auth@example.test"),
                    hasher.hash("CorrectHorse".toCharArray()));
            AuthExecutor executor = new AuthExecutor(1, 8);
            AuthService auth = new AuthService(users, executor, hasher);
            AppConfig config = new AppConfig("test", 1, 5_000, "127.0.0.1", 0, MAX_PAYLOAD,
                    10_000, 60, 32, 3, 30, 60, Set.of());
            HabbuxServer server = new HabbuxServer(config, auth, executor);
            try (server; HttpClient client = HttpClient.newHttpClient()) {
                server.start();
                Connected primary = connect(client, server);

                assertFailure(authenticate(primary, CoreMessage.AUTH_LOGIN,
                        loginPayload("missing_user", "WrongPassword")), 2);
                assertEquals(Session.State.READY, primary.session().state());
                assertFailure(authenticate(primary, CoreMessage.AUTH_LOGIN,
                        loginPayload("auth_user", "WrongPassword")), 2);
                assertEquals(Session.State.READY, primary.session().state());

                HabbuxFrame login = authenticate(primary, CoreMessage.AUTH_LOGIN,
                        loginPayload("AUTH@example.test", "CorrectHorse"));
                assertEquals(CoreMessage.AUTH_SUCCESS.id(), login.messageId());
                assertEquals(original.id(), ByteBuffer.wrap(login.payload()).getLong());
                assertEquals("Auth_User", authUsername(login.payload()));
                assertEquals(Session.State.AUTHENTICATED, primary.session().state());
                assertEquals(original, primary.session().principal());
                send(primary.socket(), CoreMessage.PING, ByteBuffer.allocate(4).putInt(81).array());
                HabbuxFrame pong = decode(primary.listener().nextBinary());
                assertEquals(CoreMessage.PONG.id(), pong.messageId());
                assertEquals(81, ByteBuffer.wrap(pong.payload()).getInt());

                Connected second = connect(client, server);
                HabbuxFrame secondLogin = authenticate(second, CoreMessage.AUTH_LOGIN,
                        loginPayload("Auth_User", "CorrectHorse"));
                assertEquals(CoreMessage.AUTH_SUCCESS.id(), secondLogin.messageId());
                assertEquals(Session.State.AUTHENTICATED, primary.session().state());
                assertEquals(Session.State.AUTHENTICATED, second.session().state());
                close(second);

                send(primary.socket(), CoreMessage.AUTH_LOGOUT, new byte[0]);
                assertEquals(CoreMessage.AUTH_LOGOUT_SUCCESS.id(), decode(primary.listener().nextBinary()).messageId());
                assertEquals(Session.State.READY, primary.session().state());
                assertNull(primary.session().principal());

                HabbuxFrame registered = authenticate(primary, CoreMessage.AUTH_REGISTER,
                        registrationPayload("New_Player", "new-player@example.test", "CorrectHorseAgain1"));
                assertEquals(CoreMessage.AUTH_SUCCESS.id(), registered.messageId());
                assertEquals("New_Player", authUsername(registered.payload()));
                send(primary.socket(), CoreMessage.AUTH_LOGOUT, new byte[0]);
                assertEquals(CoreMessage.AUTH_LOGOUT_SUCCESS.id(), decode(primary.listener().nextBinary()).messageId());
                assertFailure(authenticate(primary, CoreMessage.AUTH_REGISTER,
                        registrationPayload("New_Player", "another@example.test", "CorrectHorseAgain1")), 2);
                assertFailure(authenticate(primary, CoreMessage.AUTH_LOGIN,
                        loginPayload("Auth_User", "CorrectHorse")), 3);
                assertEquals(Session.State.READY, primary.session().state());
                close(primary);

                CountDownLatch blockerStarted = new CountDownLatch(1);
                CountDownLatch releaseBlocker = new CountDownLatch(1);
                long completedBefore = executor.snapshot().completed();
                CompletableFuture<Void> blocker = executor.submit(() -> {
                    blockerStarted.countDown();
                    releaseBlocker.await();
                    return null;
                });
                assertTrue(blockerStarted.await(3, TimeUnit.SECONDS));
                Connected dropped = null;
                try {
                    dropped = connect(client, server);
                    send(dropped.socket(), CoreMessage.AUTH_LOGIN, loginPayload("Auth_User", "CorrectHorse"));
                    send(dropped.socket(), CoreMessage.PING, ByteBuffer.allocate(4).putInt(82).array());
                    HabbuxFrame response = decode(dropped.listener().nextBinary());
                    assertEquals(CoreMessage.PONG.id(), response.messageId());
                    assertEquals(Session.State.AUTHENTICATING, dropped.session().state());
                    close(dropped);
                    awaitSessionsZero(server);
                    assertEquals(Session.State.DISCONNECTED, dropped.session().state());
                } finally {
                    releaseBlocker.countDown();
                }
                if (dropped == null) throw new AssertionError("auth-in-flight client was not created");
                blocker.get(5, TimeUnit.SECONDS);
                awaitAuthQueueDrained(executor, completedBefore + 2);
                assertEquals(Session.State.DISCONNECTED, dropped.session().state());
                assertNull(server.registry().find(dropped.session().id()));

                CountDownLatch timeoutBlockerStarted = new CountDownLatch(1);
                CountDownLatch releaseTimeoutBlocker = new CountDownLatch(1);
                long completedBeforeTimeout = executor.snapshot().completed();
                CompletableFuture<Void> timeoutBlocker = executor.submit(() -> {
                    timeoutBlockerStarted.countDown();
                    releaseTimeoutBlocker.await();
                    return null;
                });
                assertTrue(timeoutBlockerStarted.await(3, TimeUnit.SECONDS));
                Connected timedOut = null;
                try {
                    timedOut = connect(client, server);
                    send(timedOut.socket(), CoreMessage.AUTH_LOGIN, loginPayload("Auth_User", "CorrectHorse"));
                    send(timedOut.socket(), CoreMessage.PING, ByteBuffer.allocate(4).putInt(83).array());
                    HabbuxFrame timeoutPong = decode(timedOut.listener().nextBinary());
                    assertEquals(CoreMessage.PONG.id(), timeoutPong.messageId());
                    HabbuxFrame timeoutFailure = decode(timedOut.listener().nextBinary(15));
                    assertFailure(timeoutFailure, 4);
                    timedOut.listener().awaitClosed();
                    awaitSessionsZero(server);
                    assertEquals(Session.State.DISCONNECTED, timedOut.session().state());
                } finally {
                    releaseTimeoutBlocker.countDown();
                }
                if (timedOut == null) throw new AssertionError("timeout client was not created");
                timeoutBlocker.get(5, TimeUnit.SECONDS);
                awaitAuthQueueDrained(executor, completedBeforeTimeout + 2);
                assertEquals(Session.State.DISCONNECTED, timedOut.session().state());
                assertNull(server.registry().find(timedOut.session().id()));
                assertEquals(0, applicationPool.snapshot().active());
                assertEquals(0, applicationPool.snapshot().pending());

                verifyServerShutdownDuringAuthentication(client, config, users, hasher);
            } finally {
                try (DatabasePool cleanup = new DatabasePool(migrationConfig)) {
                    PostgresUserRepositoryIntegrationTest.verifyExpectedDatabase(cleanup);
                    PostgresUserRepositoryIntegrationTest.clearOnlyDedicatedTestTables(cleanup);
                }
            }
        }
    }

    private static void verifyServerShutdownDuringAuthentication(HttpClient client, AppConfig config,
            UserRepository users, Argon2idPasswordHasher hasher) throws Exception {
        AuthExecutor shutdownExecutor = new AuthExecutor(1, 4);
        AuthService shutdownAuth = new AuthService(users, shutdownExecutor, hasher);
        HabbuxServer shutdownServer = new HabbuxServer(config, shutdownAuth, shutdownExecutor);
        CountDownLatch blockerStarted = new CountDownLatch(1);
        CountDownLatch releaseBlocker = new CountDownLatch(1);
        CompletableFuture<Void> blocker = null;
        CompletableFuture<Void> shutdown = null;
        try {
            shutdownServer.start();
            blocker = shutdownExecutor.submit(() -> {
                blockerStarted.countDown();
                releaseBlocker.await();
                return null;
            });
            assertTrue(blockerStarted.await(3, TimeUnit.SECONDS));

            Connected pending = connect(client, shutdownServer);
            send(pending.socket(), CoreMessage.AUTH_LOGIN, loginPayload("Auth_User", "CorrectHorse"));
            send(pending.socket(), CoreMessage.PING, ByteBuffer.allocate(4).putInt(84).array());
            HabbuxFrame pong = decode(pending.listener().nextBinary());
            assertEquals(CoreMessage.PONG.id(), pong.messageId());
            assertEquals(84, ByteBuffer.wrap(pong.payload()).getInt());
            assertEquals(Session.State.AUTHENTICATING, pending.session().state());
            assertEquals(1, shutdownExecutor.snapshot().queued());

            shutdown = CompletableFuture.runAsync(shutdownServer::close);
            awaitSessionsZero(shutdownServer);
            assertEquals(Session.State.DISCONNECTED, pending.session().state());
            assertFalse(shutdown.isDone(), "shutdown should wait for the active auth worker");
            releaseBlocker.countDown();
            shutdown.get(5, TimeUnit.SECONDS);
            blocker.get(5, TimeUnit.SECONDS);
            awaitAuthQueueDrained(shutdownExecutor, 2);
            assertEquals(Session.State.DISCONNECTED, pending.session().state());
            assertNull(pending.session().principal());
            assertNull(shutdownServer.registry().find(pending.session().id()));
            assertEquals(0, shutdownServer.registry().activeConnections());
        } finally {
            releaseBlocker.countDown();
            if (shutdown == null) shutdownServer.close();
            else shutdown.get(5, TimeUnit.SECONDS);
            if (blocker != null) blocker.get(5, TimeUnit.SECONDS);
        }
    }

    @Test
    @Timeout(30)
    void exhaustedDatabasePoolReturnsUnavailableWhilePingStillCompletes() throws Exception {
        Map<String, String> env = System.getenv();
        String host = env.get("HABBUX_TEST_POSTGRES_HOST");
        if (host == null || env.get("HABBUX_TEST_POSTGRES_DB") == null) {
            Assumptions.abort("Habbux PostgreSQL integration variables are not configured");
        }
        Assumptions.assumeTrue(host.equals("127.0.0.1") || host.equals("localhost"),
                "PostgreSQL integration is limited to loopback");
        Assumptions.assumeTrue(PostgresUserRepositoryIntegrationTest.ALLOWED_DATABASE.equals(
                env.get("HABBUX_TEST_POSTGRES_DB")), "PostgreSQL integration requires the exact isolated database name");
        DatabaseConfig migrationConfig = PostgresUserRepositoryIntegrationTest.config(env,
                "HABBUX_TEST_POSTGRES_MIGRATION_USER", "HABBUX_TEST_POSTGRES_MIGRATION_PASSWORD");
        try (DatabasePool migrationPool = new DatabasePool(migrationConfig)) {
            PostgresUserRepositoryIntegrationTest.verifyExpectedDatabase(migrationPool);
            Flyway.configure().dataSource(migrationPool.dataSource())
                    .locations(PostgresUserRepositoryIntegrationTest.migrationLocation())
                    .cleanDisabled(true).load().migrate();
            PostgresUserRepositoryIntegrationTest.grantRuntimePrivileges(migrationPool);
            DatabaseConfig limitedConfig = new DatabaseConfig(host,
                    Integer.parseInt(env.get("HABBUX_TEST_POSTGRES_PORT")),
                    PostgresUserRepositoryIntegrationTest.ALLOWED_DATABASE,
                    env.get("HABBUX_TEST_POSTGRES_USER"), env.get("HABBUX_TEST_POSTGRES_PASSWORD"),
                    0, 1, 2_000, 60_000, 1_800_000);
            try (DatabasePool limitedPool = new DatabasePool(limitedConfig)) {
                PostgresUserRepositoryIntegrationTest.verifyExpectedDatabase(limitedPool);
                try (Connection occupied = limitedPool.dataSource().getConnection();
                     AuthExecutor executor = new AuthExecutor(1, 4)) {
                    assertTrue(occupied.isValid(1));
                    AuthService auth = new AuthService(new UserRepository(limitedPool.dataSource()), executor,
                            new Argon2idPasswordHasher());
                    AppConfig config = new AppConfig("test", 1, 5_000, "127.0.0.1", 0, MAX_PAYLOAD,
                            10_000, 60, 8, 3, 30, 60, Set.of());
                    HabbuxServer server = new HabbuxServer(config, auth, executor);
                    try (server; HttpClient client = HttpClient.newHttpClient()) {
                        server.start();
                        Connected connected = connect(client, server);
                        long completedBefore = executor.snapshot().completed();
                        send(connected.socket(), CoreMessage.AUTH_LOGIN, loginPayload("pool_user", "CorrectHorse"));
                        awaitPoolPending(limitedPool);
                        send(connected.socket(), CoreMessage.PING, ByteBuffer.allocate(4).putInt(91).array());
                        HabbuxFrame pong = decode(connected.listener().nextBinary());
                        assertEquals(CoreMessage.PONG.id(), pong.messageId());
                        assertEquals(91, ByteBuffer.wrap(pong.payload()).getInt());
                        HabbuxFrame unavailable = decode(connected.listener().nextBinary());
                        assertFailure(unavailable, 4);
                        assertEquals(Session.State.READY, connected.session().state());
                        close(connected);
                        awaitSessionsZero(server);
                        awaitAuthQueueDrained(executor, completedBefore + 1);
                        assertEquals(0, executor.snapshot().active());
                        assertEquals(0, executor.snapshot().queued());
                    }
                }
                assertEquals(0, limitedPool.snapshot().active());
                assertEquals(0, limitedPool.snapshot().pending());
            }
        }
    }

    private static Connected connect(HttpClient client, HabbuxServer server) throws Exception {
        TestListener listener = new TestListener();
        WebSocket socket = client.newWebSocketBuilder().connectTimeout(Duration.ofSeconds(5))
                .buildAsync(URI.create("ws://127.0.0.1:" + server.localPort() + "/ws"), listener)
                .get(5, TimeUnit.SECONDS);
        send(socket, CoreMessage.CLIENT_HELLO, new byte[0]);
        HabbuxFrame hello = decode(listener.nextBinary());
        assertEquals(CoreMessage.SERVER_HELLO.id(), hello.messageId());
        ByteBuffer sessionId = ByteBuffer.wrap(hello.payload());
        Session session = server.registry().find(new java.util.UUID(sessionId.getLong(), sessionId.getLong()));
        assertNotNull(session);
        return new Connected(socket, listener, session);
    }

    private static HabbuxFrame authenticate(Connected client, CoreMessage message, byte[] payload) throws Exception {
        send(client.socket(), message, payload);
        return decode(client.listener().nextBinary());
    }

    private static void assertFailure(HabbuxFrame frame, int category) {
        assertEquals(CoreMessage.AUTH_FAILURE.id(), frame.messageId());
        assertEquals(category, Byte.toUnsignedInt(frame.payload()[0]));
    }

    private static byte[] loginPayload(String identifier, String password) {
        byte[] user = identifier.getBytes(StandardCharsets.UTF_8);
        byte[] pass = password.getBytes(StandardCharsets.UTF_8);
        return ByteBuffer.allocate(4 + user.length + pass.length)
                .putShort((short) user.length).put(user).putShort((short) pass.length).put(pass).array();
    }

    private static byte[] registrationPayload(String username, String email, String password) {
        byte[] name = username.getBytes(StandardCharsets.UTF_8);
        byte[] address = email.getBytes(StandardCharsets.UTF_8);
        byte[] pass = password.getBytes(StandardCharsets.UTF_8);
        return ByteBuffer.allocate(6 + name.length + address.length + pass.length)
                .putShort((short) name.length).put(name).putShort((short) address.length).put(address)
                .putShort((short) pass.length).put(pass).array();
    }

    private static String authUsername(byte[] payload) {
        ByteBuffer result = ByteBuffer.wrap(payload);
        result.getLong();
        int length = Short.toUnsignedInt(result.getShort());
        byte[] username = new byte[length];
        result.get(username);
        return new String(username, StandardCharsets.UTF_8);
    }

    private static void send(WebSocket socket, CoreMessage message, byte[] payload) throws Exception {
        socket.sendBinary(encode(new HabbuxFrame(1, message.id(), 0, payload)), true).get(5, TimeUnit.SECONDS);
    }

    private static void close(Connected client) throws Exception {
        client.socket().sendClose(1000, "test").get(5, TimeUnit.SECONDS);
        client.listener().awaitClosed();
    }

    private static ByteBuffer encode(HabbuxFrame frame) {
        ByteBuf encoded = CODEC.encode(UnpooledByteBufAllocator.DEFAULT, frame, MAX_PAYLOAD);
        try {
            byte[] bytes = new byte[encoded.readableBytes()];
            encoded.getBytes(encoded.readerIndex(), bytes);
            return ByteBuffer.wrap(bytes);
        } finally { encoded.release(); }
    }

    private static HabbuxFrame decode(ByteBuffer data) throws Exception {
        ByteBuf input = Unpooled.wrappedBuffer(data);
        try { return CODEC.decode(input, MAX_PAYLOAD); }
        finally { input.release(); }
    }

    private static void awaitAuthQueueDrained(AuthExecutor executor, long minimumCompleted) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while ((executor.snapshot().queued() != 0 || executor.snapshot().active() != 0
                || executor.snapshot().completed() < minimumCompleted) && System.nanoTime() < deadline) {
            Thread.sleep(5);
        }
        assertEquals(0, executor.snapshot().queued());
        assertEquals(0, executor.snapshot().active());
        assertTrue(executor.snapshot().completed() >= minimumCompleted);
    }

    private static void awaitSessionsZero(HabbuxServer server) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        while (server.registry().activeSessions() != 0 && System.nanoTime() < deadline) Thread.sleep(5);
        assertEquals(0, server.registry().activeSessions());
    }

    private static void awaitPoolPending(DatabasePool pool) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        while (pool.snapshot().pending() == 0 && System.nanoTime() < deadline) Thread.sleep(5);
        assertEquals(1, pool.snapshot().active());
        assertEquals(1, pool.snapshot().pending());
    }

    private record Connected(WebSocket socket, TestListener listener, Session session) { }

    private static final class TestListener implements WebSocket.Listener {
        private final LinkedBlockingQueue<ByteBuffer> messages = new LinkedBlockingQueue<>();
        private final CompletableFuture<Void> closed = new CompletableFuture<>();
        private final AtomicReference<Throwable> failure = new AtomicReference<>();

        @Override public void onOpen(WebSocket socket) { socket.request(1); }
        @Override public java.util.concurrent.CompletionStage<?> onBinary(WebSocket socket, ByteBuffer data, boolean last) {
            byte[] copy = new byte[data.remaining()];
            data.get(copy);
            messages.offer(ByteBuffer.wrap(copy));
            socket.request(1);
            return CompletableFuture.completedFuture(null);
        }
        @Override public java.util.concurrent.CompletionStage<?> onClose(WebSocket socket, int code, String reason) {
            closed.complete(null);
            return CompletableFuture.completedFuture(null);
        }
        @Override public void onError(WebSocket socket, Throwable error) {
            failure.set(error);
            closed.completeExceptionally(error);
        }
        private ByteBuffer nextBinary() throws Exception {
            return nextBinary(5);
        }
        private ByteBuffer nextBinary(long timeoutSeconds) throws Exception {
            ByteBuffer value = messages.poll(timeoutSeconds, TimeUnit.SECONDS);
            if (value == null) throw new IllegalStateException("Timed out waiting for a Core frame");
            if (failure.get() != null) throw new IllegalStateException("WebSocket client failed", failure.get());
            return value;
        }
        private void awaitClosed() throws Exception { closed.get(5, TimeUnit.SECONDS); }
    }
}
