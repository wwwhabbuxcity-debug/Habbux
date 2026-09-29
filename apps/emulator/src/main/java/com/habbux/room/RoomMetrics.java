package com.habbux.room;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.LongAdder;

/** Low-contention aggregate counters shared by a bounded number of room workers. */
public final class RoomMetrics {
    final LongAdder acceptedEvents = new LongAdder();
    final LongAdder rejectedEvents = new LongAdder();
    final LongAdder processedEvents = new LongAdder();
    final LongAdder handlerFailures = new LongAdder();
    final Histogram queueDelay = new Histogram();
    final Histogram eventDuration = new Histogram();
    final Histogram joinLatency = new Histogram();
    final Histogram movementLatency = new Histogram();
    final LongAdder joinSuccess = new LongAdder();
    final LongAdder joinFailure = new LongAdder();
    final LongAdder leaveCount = new LongAdder();
    final LongAdder movementRequests = new LongAdder();
    final LongAdder pathfindingSuccess = new LongAdder();
    final LongAdder pathfindingFailure = new LongAdder();
    final LongAdder chatMessages = new LongAdder();
    final LongAdder roomActivations = new LongAdder();
    final LongAdder roomUnloads = new LongAdder();
    final AtomicInteger activeWorkers = new AtomicInteger();
    final AtomicInteger maxActiveWorkers = new AtomicInteger();
    final AtomicLong maxMailboxDepth = new AtomicLong();

    void observeDepth(long value) { maxMailboxDepth.accumulateAndGet(value, Math::max); }

    void workerStarted() {
        int active = activeWorkers.incrementAndGet();
        maxActiveWorkers.accumulateAndGet(active, Math::max);
    }

    void workerFinished() { activeWorkers.decrementAndGet(); }

    public Snapshot snapshot() {
        return new Snapshot(acceptedEvents.sum(), rejectedEvents.sum(), processedEvents.sum(),
                handlerFailures.sum(), queueDelay.average(), maxMailboxDepth.get(),
                queueDelay.percentile(0.50), queueDelay.percentile(0.95), queueDelay.percentile(0.99),
                eventDuration.average(), joinSuccess.sum(), joinFailure.sum(), leaveCount.sum(),
                movementRequests.sum(), pathfindingSuccess.sum(), pathfindingFailure.sum(),
                chatMessages.sum(), roomActivations.sum(), roomUnloads.sum(), activeWorkers.get(),
                maxActiveWorkers.get(), joinLatency.percentile(0.50), joinLatency.percentile(0.95),
                joinLatency.percentile(0.99), movementLatency.percentile(0.50),
                movementLatency.percentile(0.95), movementLatency.percentile(0.99));
    }

    public record Snapshot(long acceptedEvents, long rejectedEvents, long processedEvents,
                           long handlerFailures, long averageQueueDelayNanos, long maxMailboxDepth,
                           long queueDelayP50Nanos, long queueDelayP95Nanos, long queueDelayP99Nanos,
                           long averageEventDurationNanos, long joinSuccess, long joinFailure, long leaveCount,
                           long movementRequests, long pathfindingSuccess, long pathfindingFailure,
                           long chatMessages, long roomActivations, long roomUnloads, int activeWorkers,
                           int maxActiveWorkers, long joinP50Nanos, long joinP95Nanos, long joinP99Nanos,
                           long movementP50Nanos, long movementP95Nanos, long movementP99Nanos) { }

    /** Fixed logarithmic buckets keep per-event instrumentation bounded and allocation-free. */
    static final class Histogram {
        private static final int BUCKETS = 32;
        private final LongAdder[] counts = new LongAdder[BUCKETS];
        private final LongAdder totalNanos = new LongAdder();
        private final LongAdder samples = new LongAdder();

        Histogram() {
            for (int index = 0; index < counts.length; index++) counts[index] = new LongAdder();
        }

        void record(long nanos) {
            long bounded = Math.max(1, nanos);
            int bucket = Math.min(BUCKETS - 1, 64 - Long.numberOfLeadingZeros(bounded - 1));
            counts[bucket].increment();
            totalNanos.add(Math.max(0, nanos));
            samples.increment();
        }

        long average() {
            long count = samples.sum();
            return count == 0 ? 0 : totalNanos.sum() / count;
        }

        long percentile(double percentile) {
            long count = samples.sum();
            if (count == 0) return 0;
            long target = (long) Math.ceil(count * percentile);
            long cumulative = 0;
            for (int bucket = 0; bucket < counts.length; bucket++) {
                cumulative += counts[bucket].sum();
                if (cumulative >= target) return 1L << bucket;
            }
            return 1L << (BUCKETS - 1);
        }
    }
}
