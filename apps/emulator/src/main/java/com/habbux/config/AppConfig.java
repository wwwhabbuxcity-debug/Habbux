package com.habbux.config;

import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/** Validated configuration for the loopback-first Core listener. */
public record AppConfig(
        String environment,
        int eventLoopThreads,
        int shutdownTimeoutMillis,
        String bindHost,
        int port,
        int maxPayloadBytes,
        int handshakeTimeoutMillis,
        int idleTimeoutSeconds,
        int maxConnections,
        int maxPreReadyMessages,
        int messageRatePerSecond,
        int messageRateBurst,
        Set<String> allowedOrigins) {
    private static final Set<String> ENVIRONMENTS = Set.of("development", "test", "production");

    public AppConfig {
        if (!ENVIRONMENTS.contains(Objects.requireNonNull(environment, "environment"))) {
            throw new IllegalArgumentException("HABBUX_ENV must be development, test or production");
        }
        requireRange(eventLoopThreads, 1, 32, "HABBUX_EVENT_LOOP_THREADS");
        requireRange(shutdownTimeoutMillis, 1, 30_000, "HABBUX_SHUTDOWN_TIMEOUT_MS");
        if (Objects.requireNonNull(bindHost, "bindHost").isBlank()) {
            throw new IllegalArgumentException("HABBUX_BIND_HOST must not be empty");
        }
        requireRange(port, 0, 65_535, "HABBUX_PORT");
        requireRange(maxPayloadBytes, 16, 65_536, "HABBUX_MAX_PAYLOAD_BYTES");
        requireRange(handshakeTimeoutMillis, 100, 60_000, "HABBUX_HANDSHAKE_TIMEOUT_MS");
        requireRange(idleTimeoutSeconds, 1, 3600, "HABBUX_IDLE_TIMEOUT_SECONDS");
        requireRange(maxConnections, 1, 10_000, "HABBUX_MAX_CONNECTIONS");
        requireRange(maxPreReadyMessages, 1, 16, "HABBUX_MAX_PRE_READY_MESSAGES");
        requireRange(messageRatePerSecond, 1, 1_000, "HABBUX_MESSAGE_RATE_PER_SECOND");
        requireRange(messageRateBurst, 1, 5_000, "HABBUX_MESSAGE_RATE_BURST");
        allowedOrigins = Set.copyOf(Objects.requireNonNull(allowedOrigins, "allowedOrigins"));
        if (allowedOrigins.stream().anyMatch(origin -> origin.isBlank() || origin.equals("*"))) {
            throw new IllegalArgumentException("HABBUX_ALLOWED_ORIGINS must contain explicit origins");
        }
    }

    public static AppConfig from(Map<String, String> variables) {
        Objects.requireNonNull(variables, "variables");
        return new AppConfig(
                required(variables, "HABBUX_ENV"),
                integer(variables, "HABBUX_EVENT_LOOP_THREADS"),
                integer(variables, "HABBUX_SHUTDOWN_TIMEOUT_MS"),
                value(variables, "HABBUX_BIND_HOST", "127.0.0.1"),
                integerOr(variables, "HABBUX_PORT", 3100),
                integerOr(variables, "HABBUX_MAX_PAYLOAD_BYTES", 65_536),
                integerOr(variables, "HABBUX_HANDSHAKE_TIMEOUT_MS", 10_000),
                integerOr(variables, "HABBUX_IDLE_TIMEOUT_SECONDS", 120),
                integerOr(variables, "HABBUX_MAX_CONNECTIONS", 256),
                integerOr(variables, "HABBUX_MAX_PRE_READY_MESSAGES", 3),
                integerOr(variables, "HABBUX_MESSAGE_RATE_PER_SECOND", 30),
                integerOr(variables, "HABBUX_MESSAGE_RATE_BURST", 60),
                origins(variables.getOrDefault("HABBUX_ALLOWED_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173")));
    }

    private static Set<String> origins(String value) {
        return java.util.Arrays.stream(value.split(","))
                .map(String::strip)
                .filter(origin -> !origin.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    private static String required(Map<String, String> variables, String key) {
        String value = variables.get(key);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("Missing configuration: " + key);
        }
        return value.strip();
    }

    private static int integer(Map<String, String> variables, String key) {
        String value = required(variables, key);
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException ignored) {
            // Do not echo environment values: malformed configuration may contain secrets.
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

    private static String value(Map<String, String> variables, String key, String fallback) {
        String value = variables.get(key);
        return value == null || value.isBlank() ? fallback : value.strip();
    }

    private static void requireRange(int value, int min, int max, String key) {
        if (value < min || value > max) {
            throw new IllegalArgumentException(key + " must be between " + min + " and " + max);
        }
    }
}
