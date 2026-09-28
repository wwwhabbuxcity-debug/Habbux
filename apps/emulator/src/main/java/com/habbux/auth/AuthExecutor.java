package com.habbux.auth;

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
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicInteger;

/** Bounded worker pool for password hashing and blocking persistence operations. */
public final class AuthExecutor implements AutoCloseable {
    public static final int DEFAULT_THREADS = 2;
    public static final int DEFAULT_QUEUE_LIMIT = 8;
    private static final Duration DEFAULT_SHUTDOWN_TIMEOUT = Duration.ofSeconds(5);

    private final ThreadPoolExecutor executor;
    private final AtomicLong rejected = new AtomicLong();

    public AuthExecutor() { this(DEFAULT_THREADS, DEFAULT_QUEUE_LIMIT); }

    public AuthExecutor(int threads, int queueLimit) {
        if (threads < 1 || threads > 8) throw new IllegalArgumentException("threads must be 1..8");
        if (queueLimit < 1 || queueLimit > 128) throw new IllegalArgumentException("queueLimit must be 1..128");
        AtomicInteger sequence = new AtomicInteger();
        ThreadFactory factory = task -> {
            Thread thread = new Thread(task, "habbux-auth-" + sequence.incrementAndGet());
            thread.setDaemon(false);
            return thread;
        };
        executor = new ThreadPoolExecutor(threads, threads, 0, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(queueLimit), factory, new ThreadPoolExecutor.AbortPolicy());
    }

    public <T> CompletableFuture<T> submit(Callable<T> operation) {
        Objects.requireNonNull(operation, "operation");
        CompletableFuture<T> result = new CompletableFuture<>();
        AuthTask<T> task = new AuthTask<>(operation, result);
        try {
            executor.execute(task);
        } catch (RejectedExecutionException exception) {
            rejected.incrementAndGet();
            result.completeExceptionally(exception);
        }
        return result;
    }

    public Metrics snapshot() {
        return new Metrics(executor.getActiveCount(), executor.getQueue().size(), rejected.get(),
                executor.getCompletedTaskCount());
    }

    /** Stops admission, drains current work, then cancels work still queued at the deadline. */
    public boolean shutdown(Duration timeout) {
        Objects.requireNonNull(timeout, "timeout");
        if (timeout.isNegative()) throw new IllegalArgumentException("timeout must not be negative");
        executor.shutdown();
        try {
            if (executor.awaitTermination(timeout.toMillis(), TimeUnit.MILLISECONDS)) return true;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        }
        List<Runnable> neverStarted = executor.shutdownNow();
        for (Runnable task : neverStarted) {
            if (task instanceof AuthTask<?> authTask) authTask.cancel();
        }
        return executor.isTerminated();
    }

    @Override
    public void close() { shutdown(DEFAULT_SHUTDOWN_TIMEOUT); }

    public record Metrics(int active, int queued, long rejected, long completed) { }

    private static final class AuthTask<T> implements Runnable {
        private final Callable<T> operation;
        private final CompletableFuture<T> result;

        private AuthTask(Callable<T> operation, CompletableFuture<T> result) {
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
            result.completeExceptionally(new RejectedExecutionException("Auth executor shut down before task started"));
        }
    }
}
