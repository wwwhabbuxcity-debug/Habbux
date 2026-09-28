package com.habbux.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.habbux.room.RoomGridDefinition;
import com.habbux.room.RoomId;
import com.habbux.room.RoomMetadata;
import com.habbux.user.UserIdentity;
import com.habbux.user.UserRepository;
import com.habbux.user.ValidatedUser;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.Instant;
import java.util.Arrays;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

/** Room metadata integration against the same fail-closed Habbux-only loopback database. */
class RoomPostgresIntegrationTest {
    @Test
    @Timeout(30)
    void persistsOnlyRoomDefinitionAndEnforcesOwnerRestrictionAndRuntimePrivileges() throws Exception {
        Map<String, String> env = System.getenv();
        if (env.get("HABBUX_TEST_POSTGRES_HOST") == null || env.get("HABBUX_TEST_POSTGRES_DB") == null) {
            Assumptions.abort("Habbux PostgreSQL integration variables are not configured");
        }
        Assumptions.assumeTrue("127.0.0.1".equals(env.get("HABBUX_TEST_POSTGRES_HOST"))
                || "localhost".equals(env.get("HABBUX_TEST_POSTGRES_HOST")), "PostgreSQL integration is limited to loopback");
        Assumptions.assumeTrue(PostgresUserRepositoryIntegrationTest.ALLOWED_DATABASE.equals(env.get("HABBUX_TEST_POSTGRES_DB")),
                "PostgreSQL integration requires the exact isolated database name");
        DatabaseConfig migrationConfig = PostgresUserRepositoryIntegrationTest.config(env,
                "HABBUX_TEST_POSTGRES_MIGRATION_USER", "HABBUX_TEST_POSTGRES_MIGRATION_PASSWORD");
        DatabaseConfig runtimeConfig = PostgresUserRepositoryIntegrationTest.config(env,
                "HABBUX_TEST_POSTGRES_USER", "HABBUX_TEST_POSTGRES_PASSWORD");
        try (DatabasePool migrationPool = new DatabasePool(migrationConfig);
             DatabasePool runtimePool = new DatabasePool(runtimeConfig)) {
            PostgresUserRepositoryIntegrationTest.verifyExpectedDatabase(migrationPool);
            Flyway.configure().dataSource(migrationPool.dataSource())
                    .locations(PostgresUserRepositoryIntegrationTest.migrationLocation())
                    .cleanDisabled(true).load().migrate();
            PostgresUserRepositoryIntegrationTest.grantRuntimePrivileges(migrationPool);
            PostgresUserRepositoryIntegrationTest.clearOnlyDedicatedTestTables(migrationPool);

            UserRepository users = new UserRepository(runtimePool.dataSource());
            UserIdentity owner = users.create(ValidatedUser.create("room_owner", "room-owner@example.test"), testHash());
            RoomRepository rooms = new RoomRepository(runtimePool.dataSource());
            byte[] cells = new byte[12];
            Arrays.fill(cells, (byte) 1);
            cells[0] = 0;
            RoomGridDefinition grid = new RoomGridDefinition(4, 3, cells, 1, 0);
            RoomMetadata created = rooms.create(owner.id(), "Audit room", "Only persisted definition", 12, grid);
            assertTrue(created.id().value() > 0);
            assertEquals(owner.id(), created.ownerUserId());
            assertEquals("Audit room", created.name());
            assertEquals(12, created.capacity());
            assertEquals(grid, created.grid());
            assertEquals(created, rooms.findById(created.id()).orElseThrow());
            assertTrue(rooms.findById(new RoomId(created.id().value() + 100)).isEmpty());

            try (Connection connection = migrationPool.dataSource().getConnection();
                 PreparedStatement statement = connection.prepareStatement("DELETE FROM users WHERE id = ?")) {
                statement.setLong(1, owner.id());
                assertThrows(java.sql.SQLException.class, statement::executeUpdate,
                        "room ownership must prevent a user deletion without an explicit room policy");
            }
            try (Connection connection = runtimePool.dataSource().getConnection();
                 PreparedStatement statement = connection.prepareStatement("SELECT has_table_privilege(current_user, 'rooms', 'SELECT'), has_table_privilege(current_user, 'rooms', 'INSERT'), has_table_privilege(current_user, 'rooms', 'UPDATE'), has_table_privilege(current_user, 'rooms', 'DELETE')")) {
                try (ResultSet result = statement.executeQuery()) {
                    assertTrue(result.next());
                    assertTrue(result.getBoolean(1));
                    assertTrue(result.getBoolean(2));
                    assertFalse(result.getBoolean(3));
                    assertFalse(result.getBoolean(4));
                }
            }
            assertEquals(0, runtimePool.snapshot().active());
            assertEquals(0, runtimePool.snapshot().pending());
        } finally {
            try (DatabasePool cleanup = new DatabasePool(migrationConfig)) {
                PostgresUserRepositoryIntegrationTest.verifyExpectedDatabase(cleanup);
                PostgresUserRepositoryIntegrationTest.clearOnlyDedicatedTestTables(cleanup);
            }
        }
    }

    private static String testHash() {
        return "$argon2id$v=19$m=19456,t=2,p=1$MDEyMzQ1Njc4OWFiY2RlZg$MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY";
    }
}
