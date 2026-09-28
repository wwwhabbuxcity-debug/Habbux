package com.habbux.room;

import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.LongAdder;

/** Low-contention aggregate counters shared by a bounded number of room workers. */
public final class RoomMetrics {
    final LongAdder acceptedEvents = new LongAdder();
    final LongAdder rejectedEvents = new LongAdder();
    final LongAdder processedEvents = new LongAdder();
    final LongAdder handlerFailures = new LongAdder();
    final LongAdder queueDelayNanos = new LongAdder();
    final LongAdder queueSamples = new LongAdder();
    final AtomicLong maxMailboxDepth = new AtomicLong();

    void observeDepth(long value) { maxMailboxDepth.accumulateAndGet(value, Math::max); }

    public Snapshot snapshot() {
        return new Snapshot(acceptedEvents.sum(), rejectedEvents.sum(), processedEvents.sum(),
                handlerFailures.sum(), queueSamples.sum() == 0 ? 0 : queueDelayNanos.sum() / queueSamples.sum(),
                maxMailboxDepth.get());
    }

    public record Snapshot(long acceptedEvents, long rejectedEvents, long processedEvents,
                           long handlerFailures, long averageQueueDelayNanos, long maxMailboxDepth) { }
}
