package com.habbux.network;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.habbux.config.AppConfig;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

@Timeout(10)
class EventLoopRuntimeTest {
    private static AppConfig config() {
        return new AppConfig("test", 1, 5000);
    }

    @Test
    void executesReadinessTaskAndTerminatesWithoutSleep() throws Exception {
        EventLoopRuntime runtime = new EventLoopRuntime(config());
        try (runtime) {
            runtime.verifyReady();
            assertFalse(runtime.isTerminated());
        }
        assertTrue(runtime.isTerminated());
        runtime.close();
        assertTrue(runtime.isTerminated());
    }

    @Test
    void closesEvenBeforeReadiness() {
        EventLoopRuntime runtime = new EventLoopRuntime(config());
        runtime.close();
        assertTrue(runtime.isTerminated());
        assertThrows(IllegalStateException.class, runtime::verifyReady);
    }

    @Test
    void rejectsRepeatedStartup() throws Exception {
        try (EventLoopRuntime runtime = new EventLoopRuntime(config())) {
            runtime.verifyReady();
            assertThrows(IllegalStateException.class, runtime::verifyReady);
        }
    }
}
