package com.habbux.room;

import java.util.ArrayDeque;
import java.util.concurrent.atomic.AtomicBoolean;

/** Bounded FIFO owned by one runtime; its short monitor protects admission and scheduling only. */
final class RoomMailbox {
    private final ArrayDeque<QueuedTask> tasks;
    private final int capacity;
    private final int criticalReserve;
    private final int eventsPerRun;
    private final long maxRunNanos;
    private final RoomScheduler scheduler;
    private final RoomMetrics metrics;
    private boolean scheduled;
    private boolean closed;
    private final AtomicBoolean running = new AtomicBoolean();

    RoomMailbox(int capacity, int criticalReserve, int eventsPerRun, long maxRunNanos,
                RoomScheduler scheduler, RoomMetrics metrics) {
        if (capacity < 1 || criticalReserve < 0 || criticalReserve >= capacity) {
            throw new IllegalArgumentException("mailbox critical reserve must fit within its capacity");
        }
        this.tasks = new ArrayDeque<>(capacity);
        this.capacity = capacity;
        this.criticalReserve = criticalReserve;
        this.eventsPerRun = eventsPerRun;
        this.maxRunNanos = maxRunNanos;
        this.scheduler = scheduler;
        this.metrics = metrics;
    }

    boolean submit(Runnable action) {
        return submit(action, false);
    }

    boolean submitCritical(Runnable action) {
        return submit(action, true);
    }

    private boolean submit(Runnable action, boolean critical) {
        synchronized (this) {
            int admissionLimit = critical ? capacity : capacity - criticalReserve;
            if (closed || !scheduler.accepting() || tasks.size() >= admissionLimit) {
                metrics.rejectedEvents.increment();
                return false;
            }
            tasks.addLast(new QueuedTask(action, System.nanoTime()));
            if (!scheduled) {
                scheduled = true;
                if (!scheduler.enqueue(this)) {
                    scheduled = false;
                    tasks.removeLast();
                    metrics.rejectedEvents.increment();
                    return false;
                }
            }
            metrics.acceptedEvents.increment();
            metrics.observeDepth(tasks.size());
            return true;
        }
    }

    void runBatch() {
        if (!running.compareAndSet(false, true)) throw new IllegalStateException("room mailbox has concurrent owners");
        long startedAtNanos = System.nanoTime();
        int processed = 0;
        try {
            while (processed < eventsPerRun) {
                QueuedTask task;
                synchronized (this) { task = tasks.pollFirst(); }
                if (task == null) break;
                long taskStartedAtNanos = System.nanoTime();
                metrics.queueDelay.record(Math.max(0, taskStartedAtNanos - task.enqueuedAtNanos));
                try {
                    task.action.run();
                } catch (Throwable failure) {
                    if (failure instanceof VirtualMachineError fatal) throw fatal;
                    metrics.handlerFailures.increment();
                } finally {
                    metrics.eventDuration.record(Math.max(0, System.nanoTime() - taskStartedAtNanos));
                    metrics.processedEvents.increment();
                    processed++;
                }
                if (System.nanoTime() - startedAtNanos >= maxRunNanos) break;
            }
        } finally {
            synchronized (this) {
                // Release ownership before making this mailbox visible to another worker.
                running.set(false);
                if (tasks.isEmpty()) scheduled = false;
                else if (!scheduler.enqueue(this)) {
                    // With one ready-queue slot per active room this indicates a broken invariant.
                    scheduled = false;
                    closed = true;
                    metrics.rejectedEvents.add(tasks.size());
                    tasks.clear();
                }
            }
        }
    }

    synchronized void closeAdmission() { closed = true; }
    synchronized int depth() { return tasks.size(); }

    private record QueuedTask(Runnable action, long enqueuedAtNanos) { }
}
