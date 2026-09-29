package com.habbux.room;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.util.Arrays;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicIntegerArray;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

/** Short scheduler-only baseline with distributed events and per-room fairness counts. */
class RoomSchedulerBenchmarkTest {
    @Test
    @Tag("benchmark")
    @Timeout(20)
    void reportsDistributedEventThroughputAndFairnessForOneHundredAndOneThousandRooms() throws Exception {
        runDistributed(100, 50);
        runDistributed(1_000, 5);
    }

    private static void runDistributed(int roomCount, int eventsPerRoom) throws Exception {
        int totalEvents = roomCount * eventsPerRoom;
        RoomMetrics metrics = new RoomMetrics();
        RoomScheduler scheduler = new RoomScheduler(2, roomCount, metrics);
        AtomicIntegerArray processedByRoom = new AtomicIntegerArray(roomCount);
        CountDownLatch completed = new CountDownLatch(totalEvents);
        long[] completionLatencyNanos = new long[totalEvents];
        RoomMailbox[] mailboxes = new RoomMailbox[roomCount];
        for (int room = 0; room < roomCount; room++) {
            mailboxes[room] = scheduler.newMailbox(eventsPerRoom + 4, 2, 32, TimeUnit.MILLISECONDS.toNanos(2));
        }
        long startedAt = System.nanoTime();
        try {
            for (int room = 0; room < roomCount; room++) {
                for (int event = 0; event < eventsPerRoom; event++) {
                    int roomIndex = room;
                    int sampleIndex = room * eventsPerRoom + event;
                    long admittedAt = System.nanoTime();
                    assertTrue(mailboxes[room].submit(() -> {
                        completionLatencyNanos[sampleIndex] = System.nanoTime() - admittedAt;
                        processedByRoom.incrementAndGet(roomIndex);
                        completed.countDown();
                    }));
                }
            }
            assertTrue(completed.await(10, TimeUnit.SECONDS), "distributed scheduler run did not drain");
        } finally {
            assertTrue(scheduler.close(Duration.ofSeconds(3)));
        }
        long elapsedNanos = System.nanoTime() - startedAt;
        Arrays.sort(completionLatencyNanos);
        int minimum = Integer.MAX_VALUE;
        int maximum = 0;
        for (int room = 0; room < roomCount; room++) {
            int processed = processedByRoom.get(room);
            minimum = Math.min(minimum, processed);
            maximum = Math.max(maximum, processed);
            assertEquals(eventsPerRoom, processed);
        }
        RoomMetrics.Snapshot snapshot = metrics.snapshot();
        assertEquals(totalEvents, snapshot.processedEvents());
        System.out.printf(Locale.ROOT,
                "ROOM_SCHEDULER_BENCHMARK rooms=%d events=%d workerPeak=%d opsPerSecond=%.1f "
                        + "p50Micros=%.1f p95Micros=%.1f p99Micros=%.1f roomEventsMin=%d roomEventsMax=%d "
                        + "queueDepthMax=%d queueDelayP95Micros=%.1f%n",
                roomCount, totalEvents, snapshot.maxActiveWorkers(), totalEvents * 1_000_000_000d / elapsedNanos,
                percentileMicros(completionLatencyNanos, 0.50), percentileMicros(completionLatencyNanos, 0.95),
                percentileMicros(completionLatencyNanos, 0.99), minimum, maximum, snapshot.maxMailboxDepth(),
                snapshot.queueDelayP95Nanos() / 1_000d);
    }

    private static double percentileMicros(long[] sorted, double percentile) {
        int index = Math.min(sorted.length - 1, (int) Math.ceil(sorted.length * percentile) - 1);
        return sorted[index] / 1_000d;
    }
}
