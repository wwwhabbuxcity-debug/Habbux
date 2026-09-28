package com.habbux.room;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.habbux.user.UserIdentity;
import java.lang.management.ManagementFactory;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

/** Isolated local microbenchmark; reports observations without a machine-specific pass threshold. */
class RoomPathfindingBenchmarkTest {
    @Test
    @Tag("benchmark")
    @Timeout(12)
    void reportsBoundedPathRequestLatencyThroughRoomMailbox() throws Exception {
        int width = 64;
        byte[] walkability = new byte[width * width];
        Arrays.fill(walkability, (byte) 1);
        Instant now = Instant.now();
        RoomMetadata room = new RoomMetadata(new RoomId(95), 1, "Path benchmark", "", 1,
                new RoomGridDefinition(width, width, walkability, 0, 0), now, now);
        RoomManager manager = new RoomManager(id -> java.util.Optional.of(room),
                new RoomConfig(1, 2, 256, 32, 2, 10_000, 1, 4, 4_096, 128, 1_000));
        UUID sessionId = UUID.randomUUID();
        try {
            RoomManager.JoinHandle join = manager.join(room.id(), sessionId,
                    new UserIdentity(95, "bench_user"), ignored -> { });
            assertEquals(RoomRuntime.JoinOutcome.JOINED, join.result().get(2, TimeUnit.SECONDS));
            for (int index = 0; index < 100; index++) {
                assertEquals(RoomRuntime.MoveOutcome.MOVING,
                        manager.move(room.id(), sessionId, 63, 63, ignored -> { }).get(2, TimeUnit.SECONDS));
            }

            com.sun.management.ThreadMXBean allocationBean = allocationBean();
            long[] workerIds = roomWorkerIds();
            long allocatedBefore = readAllocatedBytes(allocationBean, workerIds);
            int iterations = 500;
            long[] latencyNanos = new long[iterations];
            long started = System.nanoTime();
            for (int index = 0; index < iterations; index++) {
                long operationStarted = System.nanoTime();
                RoomRuntime.MoveOutcome outcome = manager.move(room.id(), sessionId, 63, 63, ignored -> { })
                        .get(2, TimeUnit.SECONDS);
                latencyNanos[index] = System.nanoTime() - operationStarted;
                assertEquals(RoomRuntime.MoveOutcome.MOVING, outcome);
            }
            long elapsedNanos = System.nanoTime() - started;
            long allocatedAfter = readAllocatedBytes(allocationBean, workerIds);
            Arrays.sort(latencyNanos);
            double operationsPerSecond = iterations * 1_000_000_000d / elapsedNanos;
            long allocatedPerOperation = allocatedBefore < 0 || allocatedAfter < allocatedBefore
                    ? -1 : (allocatedAfter - allocatedBefore) / iterations;
            System.out.printf(Locale.ROOT,
                    "ROOM_PATHFINDING_BENCHMARK grid=%dx%d neighbors=4 iterations=%d opsPerSecond=%.1f "
                            + "p50Micros=%.1f p95Micros=%.1f p99Micros=%.1f allocatedBytesPerOp=%s%n",
                    width, width, iterations, operationsPerSecond,
                    percentileMicros(latencyNanos, 0.50), percentileMicros(latencyNanos, 0.95),
                    percentileMicros(latencyNanos, 0.99), allocatedPerOperation < 0 ? "unavailable" : allocatedPerOperation);
        } finally {
            org.junit.jupiter.api.Assertions.assertTrue(manager.close(Duration.ofSeconds(3)));
        }
    }

    private static com.sun.management.ThreadMXBean allocationBean() {
        java.lang.management.ThreadMXBean bean = ManagementFactory.getThreadMXBean();
        if (!(bean instanceof com.sun.management.ThreadMXBean extended) || !extended.isThreadAllocatedMemorySupported()) {
            return null;
        }
        if (!extended.isThreadAllocatedMemoryEnabled()) extended.setThreadAllocatedMemoryEnabled(true);
        return extended;
    }

    private static long[] roomWorkerIds() {
        return Thread.getAllStackTraces().keySet().stream()
                .filter(thread -> thread.isAlive() && thread.getName().startsWith("habbux-room-worker-"))
                .mapToLong(Thread::threadId).toArray();
    }

    private static long readAllocatedBytes(com.sun.management.ThreadMXBean bean, long[] threadIds) {
        if (bean == null || threadIds.length == 0) return -1;
        long total = 0;
        for (long threadId : threadIds) {
            long allocated = bean.getThreadAllocatedBytes(threadId);
            if (allocated < 0) return -1;
            total += allocated;
        }
        return total;
    }

    private static double percentileMicros(long[] sorted, double percentile) {
        int index = Math.min(sorted.length - 1, (int) Math.ceil(sorted.length * percentile) - 1);
        return sorted[index] / 1_000d;
    }
}
