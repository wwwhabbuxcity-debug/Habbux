package com.habbux.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class AppConfigTest {
    private static Map<String, String> valid() {
        return Map.of(
                "HABBUX_ENV", "test",
                "HABBUX_EVENT_LOOP_THREADS", "1",
                "HABBUX_SHUTDOWN_TIMEOUT_MS", "5000");
    }

    @ParameterizedTest
    @ValueSource(strings = {"development", "test", "production"})
    void acceptsExplicitEnvironments(String environment) {
        Map<String, String> variables = new HashMap<>(valid());
        variables.put("HABBUX_ENV", environment);
        AppConfig config = AppConfig.from(variables);
        assertEquals(environment, config.environment());
        assertEquals(1, config.eventLoopThreads());
        assertEquals(5000, config.shutdownTimeoutMillis());
    }

    @ParameterizedTest
    @ValueSource(strings = {"HABBUX_ENV", "HABBUX_EVENT_LOOP_THREADS", "HABBUX_SHUTDOWN_TIMEOUT_MS"})
    void rejectsMissingConfiguration(String key) {
        Map<String, String> variables = new HashMap<>(valid());
        variables.remove(key);
        assertThrows(IllegalArgumentException.class, () -> AppConfig.from(variables));
    }

    @ParameterizedTest
    @CsvSource({
        "HABBUX_ENV,staging",
        "HABBUX_EVENT_LOOP_THREADS,0",
        "HABBUX_EVENT_LOOP_THREADS,33",
        "HABBUX_EVENT_LOOP_THREADS,1.5",
        "HABBUX_SHUTDOWN_TIMEOUT_MS,0",
        "HABBUX_SHUTDOWN_TIMEOUT_MS,30001",
        "HABBUX_SHUTDOWN_TIMEOUT_MS,999999999999999"
    })
    void rejectsInvalidConfiguration(String key, String value) {
        Map<String, String> variables = new HashMap<>(valid());
        variables.put(key, value);
        assertThrows(IllegalArgumentException.class, () -> AppConfig.from(variables));
    }

    @Test
    void doesNotEchoUntrustedConfigurationValues() {
        Map<String, String> variables = new HashMap<>(valid());
        variables.put("HABBUX_EVENT_LOOP_THREADS", "sensitive-invalid-value");
        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class, () -> AppConfig.from(variables));
        assertFalse(error.getMessage().contains("sensitive-invalid-value"));
    }
}
