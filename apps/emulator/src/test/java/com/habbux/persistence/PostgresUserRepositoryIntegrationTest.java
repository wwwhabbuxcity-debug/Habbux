package com.habbux.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import com.habbux.user.AccountStatus;
import com.habbux.user.DuplicateUserException;
import com.habbux.user.LoginIdentifier;
import com.habbux.user.UserIdentity;
import com.habbux.user.UserRepository;
import com.habbux.user.ValidatedUser;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Map;
import java.util.Optional;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

/** Opt-in integration, fail-closed to a specifically named loopback test database. */
class PostgresUserRepositoryIntegrationTest {
    static final String ALLOWED_DATABASE = "habbux_phase2_test";

    @Test
    @Timeout(30)
    void migratesAndExercisesUserRepositoryInIsolatedDatabase() throws Exception {
        Map<String, String> env = System.getenv();
        String host = env.get("HABBUX_TEST_POSTGRES_HOST");
        if (host == null || env.get("HABBUX_TEST_POSTGRES_DB") == null) {
            Assumptions.abort("Habbux PostgreSQL integration variables are not configured");
        }
        Assumptions.assumeTrue(host.equals("127.0.0.1") || host.equals("localhost"),
                "PostgreSQL integration is limited to loopback");
        Assumptions.assumeTrue(ALLOWED_DATABASE.equals(env.get("HABBUX_TEST_POSTGRES_DB")),
                "PostgreSQL integration requires the exact isolated database name");

        DatabaseConfig migrationConfig = config(env, "HABBUX_TEST_POSTGRES_MIGRATION_USER",
                "HABBUX_TEST_POSTGRES_MIGRATION_PASSWORD");
        DatabaseConfig applicationConfig = config(env, "HABBUX_TEST_POSTGRES_USER", "HABBUX_TEST_POSTGRES_PASSWORD");
        try (DatabasePool migrationPool = new DatabasePool(migrationConfig);
             DatabasePool applicationPool = new DatabasePool(applicationConfig)) {
            verifyExpectedDatabase(migrationPool);
            Flyway.configure().dataSource(migrationPool.dataSource()).locations(migrationLocation())
                    .cleanDisabled(true).load().migrate();
            grantRuntimePrivileges(migrationPool);
            clearOnlyDedicatedTestTables(migrationPool);
            verifyRuntimeDatabaseSettings(applicationPool);

            UserRepository repository = new UserRepository(applicationPool.dataSource());
            assertEquals(Optional.empty(), repository.findForAuthentication(LoginIdentifier.from("andre_7")));
            UserIdentity created = repository.create(ValidatedUser.create("Andre_7", "andre@example.test"),
                    "$argon2id$v=19$m=19456,t=2,p=1$MDEyMzQ1Njc4OWFiY2RlZg$"
                            + "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY");
            assertTrue(created.id() > 0);
            assertEquals("Andre_7", created.username());
            assertThrows(DuplicateUserException.class, () -> repository.create(
                    ValidatedUser.create("ANDRE_7", "different@example.test"), createdHash()));
            assertThrows(DuplicateUserException.class, () -> repository.create(
                    ValidatedUser.create("other_user", "ANDRE@example.test"), createdHash()));
            assertThrows(UserRepository.UserDataAccessException.class, () -> repository.create(
                    ValidatedUser.create("rollback_user", "rollback@example.test"), "$argon2id$" + "x".repeat(80)));
            assertTrue(repository.findForAuthentication(LoginIdentifier.from("rollback_user")).isEmpty());
            assertConcurrentRegistrationConstraint(repository);

            var byUsername = repository.findForAuthentication(LoginIdentifier.from("ANDRE_7")).orElseThrow();
            var byEmail = repository.findForAuthentication(LoginIdentifier.from("ANDRE@example.test")).orElseThrow();
            assertEquals(created, byUsername.identity());
            assertEquals(created, byEmail.identity());
            assertEquals(AccountStatus.ACTIVE, byUsername.status());
            assertFalse(byUsername.passwordHash().isBlank());
            assertEquals(0, applicationPool.snapshot().active());
            assertEquals(0, applicationPool.snapshot().pending());
        } finally {
            try (DatabasePool cleanup = new DatabasePool(migrationConfig)) {
                verifyExpectedDatabase(cleanup);
                clearOnlyDedicatedTestTables(cleanup);
            }
        }
    }

    static DatabaseConfig config(Map<String, String> env, String userKey, String passwordKey) {
        return new DatabaseConfig(
                env.get("HABBUX_TEST_POSTGRES_HOST"),
                parsePort(env.get("HABBUX_TEST_POSTGRES_PORT")),
                env.get("HABBUX_TEST_POSTGRES_DB"),
                required(env, userKey),
                required(env, passwordKey),
                1, 2, 5_000, 60_000, 1_800_000);
    }

    private static int parsePort(String port) {
        try {
            return Integer.parseInt(port);
        } catch (RuntimeException exception) {
            throw new IllegalArgumentException("HABBUX_TEST_POSTGRES_PORT must be configured");
        }
    }

    private static String required(Map<String, String> env, String key) {
        String value = env.get(key);
        if (value == null || value.isBlank()) Assumptions.abort("Missing PostgreSQL integration variable: " + key);
        return value;
    }

    static String migrationLocation() {
        return "filesystem:" + java.nio.file.Path.of("..", "..", "database", "migrations")
                .toAbsolutePath().normalize();
    }

    static void verifyExpectedDatabase(DatabasePool pool) throws SQLException {
        try (Connection connection = pool.dataSource().getConnection();
             PreparedStatement statement = connection.prepareStatement("SELECT current_database()")) {
            statement.setQueryTimeout(3);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next() || !ALLOWED_DATABASE.equals(result.getString(1))) {
                    throw new IllegalStateException("Refusing PostgreSQL operation outside the dedicated test database");
                }
            }
        }
    }

    static void clearOnlyDedicatedTestTables(DatabasePool pool) throws SQLException {
        verifyExpectedDatabase(pool);
        try (Connection connection = pool.dataSource().getConnection();
             PreparedStatement statement = connection.prepareStatement(
                     "TRUNCATE TABLE user_credentials, users RESTART IDENTITY")) {
            statement.setQueryTimeout(3);
            statement.execute();
        }
    }

    static void grantRuntimePrivileges(DatabasePool pool) throws SQLException {
        verifyExpectedDatabase(pool);
        try (Connection connection = pool.dataSource().getConnection();
             java.sql.Statement statement = connection.createStatement()) {
            statement.setQueryTimeout(3);
            statement.execute("REVOKE ALL PRIVILEGES ON TABLE users, user_credentials FROM habbux_phase2_app");
            statement.execute("REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM habbux_phase2_app");
            statement.execute("ALTER DEFAULT PRIVILEGES FOR ROLE habbux_phase2_migration IN SCHEMA public "
                    + "REVOKE ALL ON TABLES FROM habbux_phase2_app");
            statement.execute("ALTER DEFAULT PRIVILEGES FOR ROLE habbux_phase2_migration IN SCHEMA public "
                    + "REVOKE ALL ON SEQUENCES FROM habbux_phase2_app");
            statement.execute("GRANT SELECT (id, username, username_normalized, email_normalized, status) "
                    + "ON users TO habbux_phase2_app");
            statement.execute("GRANT SELECT (user_id, password_hash) ON user_credentials TO habbux_phase2_app");
            statement.execute("GRANT INSERT (username, username_normalized, email, email_normalized) "
                    + "ON users TO habbux_phase2_app");
            statement.execute("GRANT INSERT (user_id, password_hash) ON user_credentials TO habbux_phase2_app");
            statement.execute("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO habbux_phase2_app");
        }
    }

    private static void verifyRuntimeDatabaseSettings(DatabasePool pool) throws SQLException {
        verifyExpectedDatabase(pool);
        try (Connection connection = pool.dataSource().getConnection();
             PreparedStatement statement = connection.prepareStatement("""
                     SELECT current_setting('TimeZone'),
                            has_column_privilege(current_user, 'users', 'username', 'INSERT'),
                            has_column_privilege(current_user, 'users', 'username_normalized', 'SELECT'),
                            has_column_privilege(current_user, 'users', 'email', 'SELECT'),
                            has_column_privilege(current_user, 'users', 'username', 'UPDATE'),
                            has_table_privilege(current_user, 'users', 'DELETE')
                     """)) {
            statement.setQueryTimeout(3);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) throw new IllegalStateException("Database settings query returned no row");
                assertEquals("UTC", result.getString(1));
                assertTrue(result.getBoolean(2));
                assertTrue(result.getBoolean(3));
                assertFalse(result.getBoolean(4));
                assertFalse(result.getBoolean(5));
                assertFalse(result.getBoolean(6));
            }
        }
    }

    private static void assertConcurrentRegistrationConstraint(UserRepository repository) throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch begin = new CountDownLatch(1);
        try (com.habbux.auth.AuthExecutor executor = new com.habbux.auth.AuthExecutor(2, 2)) {
            CompletableFuture<UserIdentity> first = executor.submit(() -> {
                ready.countDown();
                begin.await();
                return repository.create(ValidatedUser.create("race_user", "race@example.test"), createdHash());
            });
            CompletableFuture<UserIdentity> second = executor.submit(() -> {
                ready.countDown();
                begin.await();
                return repository.create(ValidatedUser.create("race_user", "race@example.test"), createdHash());
            });
            assertTrue(ready.await(3, TimeUnit.SECONDS));
            begin.countDown();
            int created = 0;
            int duplicated = 0;
            for (CompletableFuture<UserIdentity> future : List.of(first, second)) {
                try {
                    assertTrue(future.get(5, TimeUnit.SECONDS).id() > 0);
                    created++;
                } catch (ExecutionException exception) {
                    assertTrue(exception.getCause() instanceof DuplicateUserException);
                    duplicated++;
                }
            }
            assertEquals(1, created);
            assertEquals(1, duplicated);
        }
    }

    private static String createdHash() {
        return "$argon2id$v=19$m=19456,t=2,p=1$MDEyMzQ1Njc4OWFiY2RlZg$"
                + "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY";
    }
}
