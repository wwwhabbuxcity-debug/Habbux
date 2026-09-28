package com.habbux.room;

import java.time.Duration;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

/** Fixed shared worker set and bounded ready queue. A mailbox runs on one worker at a time. */
public final class RoomScheduler implements AutoCloseable {
    private final ArrayBlockingQueue<RoomMailbox> ready;
    private final AtomicBoolean accepting = new AtomicBoolean(true);
    private final Thread[] workers;
    private final RoomMetrics metrics;

    public RoomScheduler(int workerCount, int maxActiveRooms, RoomMetrics metrics) {
        if (workerCount < 1 || workerCount > 8 || maxActiveRooms < 1) throw new IllegalArgumentException("invalid scheduler bounds");
        this.ready = new ArrayBlockingQueue<>(maxActiveRooms);
        this.metrics = java.util.Objects.requireNonNull(metrics, "metrics");
        workers = new Thread[workerCount];
        for (int i = 0; i < workers.length; i++) {
            Thread worker = new Thread(this::work, "habbux-room-worker-" + (i + 1));
            worker.setDaemon(false);
            workers[i] = worker;
            worker.start();
        }
    }

    RoomMailbox newMailbox(int capacity, int criticalReserve, int eventsPerRun, long maxRunNanos) {
        return new RoomMailbox(capacity, criticalReserve, eventsPerRun, maxRunNanos, this, metrics);
    }

    boolean accepting() { return accepting.get(); }

    boolean enqueue(RoomMailbox mailbox) { return accepting.get() && ready.offer(mailbox); }

    private void work() {
        while (accepting.get() || !ready.isEmpty()) {
            try {
                RoomMailbox mailbox = ready.poll(100, TimeUnit.MILLISECONDS);
                if (mailbox != null) mailbox.runBatch();
            } catch (InterruptedException interrupted) {
                if (accepting.get()) Thread.currentThread().interrupt();
                return;
            } catch (VirtualMachineError fatal) {
                throw fatal;
            } catch (Throwable failure) {
                metrics.handlerFailures.increment();
            }
        }
    }

    public int workerCount() { return workers.length; }
    public int liveWorkerCount() { return (int) java.util.Arrays.stream(workers).filter(Thread::isAlive).count(); }

    public boolean close(Duration timeout) {
        accepting.set(false);
        long deadline = System.nanoTime() + timeout.toNanos();
        boolean stopped = true;
        for (Thread worker : workers) {
            long remaining = deadline - System.nanoTime();
            if (remaining <= 0) { stopped = false; break; }
            try { worker.join(Math.max(1, TimeUnit.NANOSECONDS.toMillis(remaining))); }
            catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); stopped = false; break; }
            if (worker.isAlive()) stopped = false;
        }
        return stopped;
    }

    @Override public void close() { close(Duration.ofSeconds(5)); }
}
