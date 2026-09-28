package com.habbux.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class AuthExecutorTest {
    @Test
    void queueIsBoundedAndSaturationRejectsWithoutRunningCallerTask() throws Exception {
        AuthExecutor executor = new AuthExecutor(2, 8);
        CountDownLatch workersStarted = new CountDownLatch(2);
        CountDownLatch release = new CountDownLatch(1);
        List<CompletableFuture<Integer>> accepted = new ArrayList<>();
        try {
            accepted.add(executor.submit(() -> { workersStarted.countDown(); release.await(); return 1; }));
            accepted.add(executor.submit(() -> { workersStarted.countDown(); release.await(); return 2; }));
            assertTrue(workersStarted.await(2, TimeUnit.SECONDS));
            for (int index = 0; index < 8; index++) accepted.add(executor.submit(() -> 3));

            CompletableFuture<Integer> rejected = executor.submit(() -> 4);
            assertInstanceOf(RejectedExecutionException.class,
                    org.junit.jupiter.api.Assertions.assertThrows(ExecutionException.class, rejected::get).getCause());
            assertEquals(1, executor.snapshot().rejected());
            assertEquals(8, executor.snapshot().queued());
        } finally {
            release.countDown();
        }
        for (CompletableFuture<Integer> future : accepted) future.get(2, TimeUnit.SECONDS);
        assertTrue(executor.shutdown(Duration.ofSeconds(2)));
    }
}
