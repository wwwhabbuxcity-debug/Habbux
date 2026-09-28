package com.habbux.persistence;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertFalse;
import java.util.Map;
import org.junit.jupiter.api.Test;

class DatabaseConfigTest {
    @Test
    void parsesBoundedLocalSettingsAndRedactsPassword() {
        DatabaseConfig config = DatabaseConfig.from(Map.of(
                "POSTGRES_HOST", "127.0.0.1", "POSTGRES_PORT", "5432", "POSTGRES_DB", "habbux",
                "POSTGRES_USER", "habbux_app", "POSTGRES_PASSWORD", "secret-value"));

        assertEquals("jdbc:postgresql://127.0.0.1:5432/habbux", config.jdbcUrl());
        assertEquals(1, config.minimumPoolSize());
        assertEquals(2, config.maximumPoolSize());
        assertFalse(config.toString().contains("secret-value"));
    }

    @Test
    void preservesPasswordWhitespaceWithoutDisplayingIt() {
        DatabaseConfig config = DatabaseConfig.from(Map.of(
                "POSTGRES_HOST", "localhost", "POSTGRES_PORT", "5432", "POSTGRES_DB", "habbux",
                "POSTGRES_USER", "habbux_app", "POSTGRES_PASSWORD", " secret "));
        assertEquals(" secret ", config.password());
        assertFalse(config.toString().contains(" secret "));
    }

    @Test
    void rejectsInvalidPoolAndJdbcComponents() {
        assertThrows(IllegalArgumentException.class, () -> new DatabaseConfig(
                "localhost", 5432, "habbux", "habbux_app", "pw", 3, 2, 1500, 10_000, 30_000));
        assertThrows(IllegalArgumentException.class, () -> new DatabaseConfig(
                "localhost/other", 5432, "habbux", "habbux_app", "pw", 1, 2, 1500, 10_000, 30_000));
        assertThrows(IllegalArgumentException.class, () -> new DatabaseConfig(
                "localhost", 5432, "habbux", "habbux_app", "pw", 1, 2, 250, 10_000, 30_000));
    }
}
