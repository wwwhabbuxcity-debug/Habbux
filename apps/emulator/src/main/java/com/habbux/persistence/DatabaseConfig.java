package com.habbux.persistence;

import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;

/** External PostgreSQL settings. The password is deliberately omitted from toString(). */
public final class DatabaseConfig {
    private static final Pattern HOST = Pattern.compile("[A-Za-z0-9.-]{1,253}");
    private static final Pattern IDENTIFIER = Pattern.compile("[A-Za-z_][A-Za-z0-9_]{0,62}");

    private final String host;
    private final int port;
    private final String database;
    private final String username;
    private final String dbCredential;
    private final int minimumPoolSize;
    private final int maximumPoolSize;
    private final int connectionTimeoutMillis;
    private final int idleTimeoutMillis;
    private final int maxLifetimeMillis;

    public DatabaseConfig(String host, int port, String database, String username, String password,
                          int minimumPoolSize, int maximumPoolSize, int connectionTimeoutMillis,
                          int idleTimeoutMillis, int maxLifetimeMillis) {
        this.host = requireMatch(host, HOST, "POSTGRES_HOST");
        this.port = requireRange(port, 1, 65_535, "POSTGRES_PORT");
        this.database = requireMatch(database, IDENTIFIER, "POSTGRES_DB");
        this.username = requireMatch(username, IDENTIFIER, "POSTGRES_USER");
        this.dbCredential = Objects.requireNonNull(password, "password");
        if (password.isBlank() || password.length() > 512) {
            throw new IllegalArgumentException("POSTGRES_PASSWORD must be non-empty and at most 512 characters");
        }
        this.minimumPoolSize = requireRange(minimumPoolSize, 0, 10, "POSTGRES_POOL_MIN");
        this.maximumPoolSize = requireRange(maximumPoolSize, 1, 20, "POSTGRES_POOL_MAX");
        if (minimumPoolSize > maximumPoolSize) {
            throw new IllegalArgumentException("POSTGRES_POOL_MIN must not exceed POSTGRES_POOL_MAX");
        }
        this.connectionTimeoutMillis = requireRange(connectionTimeoutMillis, 500, 30_000,
                "POSTGRES_CONNECTION_TIMEOUT_MS");
        this.idleTimeoutMillis = requireRange(idleTimeoutMillis, 10_000, 600_000, "POSTGRES_IDLE_TIMEOUT_MS");
        this.maxLifetimeMillis = requireRange(maxLifetimeMillis, 30_000, 1_800_000, "POSTGRES_MAX_LIFETIME_MS");
        if (idleTimeoutMillis >= maxLifetimeMillis) {
            throw new IllegalArgumentException("POSTGRES_IDLE_TIMEOUT_MS must be below POSTGRES_MAX_LIFETIME_MS");
        }
    }

    public static DatabaseConfig from(Map<String, String> variables) {
        Objects.requireNonNull(variables, "variables");
        return new DatabaseConfig(
                required(variables, "POSTGRES_HOST"),
                integer(variables, "POSTGRES_PORT"),
                required(variables, "POSTGRES_DB"),
                required(variables, "POSTGRES_USER"),
                requiredSecret(variables, "POSTGRES_PASSWORD"),
                integerOr(variables, "POSTGRES_POOL_MIN", 1),
                integerOr(variables, "POSTGRES_POOL_MAX", 2),
                integerOr(variables, "POSTGRES_CONNECTION_TIMEOUT_MS", 1_500),
                integerOr(variables, "POSTGRES_IDLE_TIMEOUT_MS", 600_000),
                integerOr(variables, "POSTGRES_MAX_LIFETIME_MS", 1_800_000));
    }

    public String jdbcUrl() { return "jdbc:postgresql://" + host + ":" + port + "/" + database; }
    public String username() { return username; }
    public String password() { return dbCredential; }
    public int minimumPoolSize() { return minimumPoolSize; }
    public int maximumPoolSize() { return maximumPoolSize; }
    public int connectionTimeoutMillis() { return connectionTimeoutMillis; }
    public int idleTimeoutMillis() { return idleTimeoutMillis; }
    public int maxLifetimeMillis() { return maxLifetimeMillis; }

    @Override
    public String toString() {
        return "DatabaseConfig[host=" + host + ", port=" + port + ", database=" + database
                + ", username=" + username + ", password=<redacted>, minimumPoolSize=" + minimumPoolSize
                + ", maximumPoolSize=" + maximumPoolSize + ", connectionTimeoutMillis="
                + connectionTimeoutMillis + ", idleTimeoutMillis=" + idleTimeoutMillis
                + ", maxLifetimeMillis=" + maxLifetimeMillis + "]";
    }

    private static String required(Map<String, String> variables, String key) {
        String value = variables.get(key);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing configuration: " + key);
        return value.strip();
    }

    private static String requiredSecret(Map<String, String> variables, String key) {
        String value = variables.get(key);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing configuration: " + key);
        return value;
    }

    private static int integer(Map<String, String> variables, String key) {
        String value = required(variables, key);
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException ignored) {
            throw new IllegalArgumentException(key + " must be an integer");
        }
    }

    private static int integerOr(Map<String, String> variables, String key, int fallback) {
        String value = variables.get(key);
        if (value == null || value.isBlank()) return fallback;
        try {
            return Integer.parseInt(value.strip());
        } catch (NumberFormatException ignored) {
            throw new IllegalArgumentException(key + " must be an integer");
        }
    }

    private static String requireMatch(String value, Pattern pattern, String key) {
        Objects.requireNonNull(value, key);
        if (!pattern.matcher(value).matches()) throw new IllegalArgumentException(key + " has an invalid format");
        return value;
    }

    private static int requireRange(int value, int minimum, int maximum, String key) {
        if (value < minimum || value > maximum) {
            throw new IllegalArgumentException(key + " must be between " + minimum + " and " + maximum);
        }
        return value;
    }
}
