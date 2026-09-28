package com.habbux.config;

import java.util.Map;
import java.util.Objects;
import java.util.Set;

/** Validated external bootstrap configuration. No credentials or network defaults. */
public record AppConfig(String environment, int eventLoopThreads, int shutdownTimeoutMillis) {
    private static final Set<String> ENVIRONMENTS = Set.of("development", "test", "production");

    public AppConfig {
        if (!ENVIRONMENTS.contains(Objects.requireNonNull(environment, "environment"))) {
            throw new IllegalArgumentException("HABBUX_ENV must be development, test or production");
        }
        requireRange(eventLoopThreads, 1, 32, "HABBUX_EVENT_LOOP_THREADS");
        requireRange(shutdownTimeoutMillis, 1, 30_000, "HABBUX_SHUTDOWN_TIMEOUT_MS");
    }

    public static AppConfig from(Map<String, String> variables) {
        Objects.requireNonNull(variables, "variables");
        return new AppConfig(
                required(variables, "HABBUX_ENV"),
                integer(variables, "HABBUX_EVENT_LOOP_THREADS"),
                integer(variables, "HABBUX_SHUTDOWN_TIMEOUT_MS"));
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

    private static void requireRange(int value, int min, int max, String key) {
        if (value < min || value > max) {
            throw new IllegalArgumentException(key + " must be between " + min + " and " + max);
        }
    }
}
