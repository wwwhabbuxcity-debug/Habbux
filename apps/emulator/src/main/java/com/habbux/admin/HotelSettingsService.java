package com.habbux.admin;

import java.time.Duration;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/** Keeps a validated read snapshot while routing owner writes through a bounded control executor. */
public final class HotelSettingsService implements AutoCloseable {
    private static final Duration DEFAULT_SHUTDOWN_TIMEOUT = Duration.ofSeconds(5);
    private final HotelSettingsStore store;
    private final ThreadPoolExecutor executor;
    private final AtomicLong rejected = new AtomicLong();
    private volatile HotelSettings current;

    public HotelSettingsService(HotelSettingsStore store) {
        this.store = Objects.requireNonNull(store, "store");
        current = store.load();
        AtomicInteger sequence = new AtomicInteger();
        ThreadFactory factory = task -> {
            Thread thread = new Thread(task, "habbux-admin-control-" + sequence.incrementAndGet());
            thread.setDaemon(false);
            return thread;
        };
        executor = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(4), factory, new ThreadPoolExecutor.AbortPolicy());
    }

    private HotelSettingsService() {
        store = null;
        executor = null;
        current = HotelSettings.defaults();
    }

    public static HotelSettingsService unavailable() { return new HotelSettingsService(); }

    public boolean available() { return store != null; }

    public HotelSettings current() { return current; }

    public boolean registrationsEnabled() { return current.registrationsEnabled(); }

    public boolean maintenanceEnabled() { return current.maintenanceEnabled(); }

    public CompletableFuture<HotelSettings> update(HotelSettings requested) {
        Objects.requireNonNull(requested, "requested");
        if (!available()) return CompletableFuture.failedFuture(new IllegalStateException("hotel controls are unavailable"));
        return submit(() -> {
            HotelSettings saved = store.save(requested);
            current = saved;
            return saved;
        });
    }

    public Metrics snapshot() {
        if (!available()) return new Metrics(0, 0, rejected.get(), 0);
        return new Metrics(executor.getActiveCount(), executor.getQueue().size(), rejected.get(), executor.getCompletedTaskCount());
    }

    public boolean shutdown(Duration timeout) {
        Objects.requireNonNull(timeout, "timeout");
        if (!available()) return true;
        executor.shutdown();
        try {
            if (executor.awaitTermination(timeout.toMillis(), TimeUnit.MILLISECONDS)) return true;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        }
        List<Runnable> neverStarted = executor.shutdownNow();
        for (Runnable task : neverStarted) {
            if (task instanceof ControlTask<?> controlTask) controlTask.cancel();
        }
        return executor.isTerminated();
    }

    @Override
    public void close() { shutdown(DEFAULT_SHUTDOWN_TIMEOUT); }

    private <T> CompletableFuture<T> submit(Callable<T> operation) {
        CompletableFuture<T> result = new CompletableFuture<>();
        try {
            executor.execute(new ControlTask<>(operation, result));
        } catch (RejectedExecutionException exception) {
            rejected.incrementAndGet();
            result.completeExceptionally(exception);
        }
        return result;
    }

    public record Metrics(int active, int queued, long rejected, long completed) { }

    private static final class ControlTask<T> implements Runnable {
        private final Callable<T> operation;
        private final CompletableFuture<T> result;

        private ControlTask(Callable<T> operation, CompletableFuture<T> result) {
            this.operation = operation;
            this.result = result;
        }

        @Override
        public void run() {
            if (result.isCancelled()) return;
            try {
                result.complete(operation.call());
            } catch (InterruptedException failure) {
                Thread.currentThread().interrupt();
                result.completeExceptionally(failure);
            } catch (Exception failure) {
                result.completeExceptionally(failure);
            }
        }

        private void cancel() {
            result.completeExceptionally(new RejectedExecutionException("admin executor stopped before task started"));
        }
    }
}
