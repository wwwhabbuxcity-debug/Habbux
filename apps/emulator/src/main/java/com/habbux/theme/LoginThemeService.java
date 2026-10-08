package com.habbux.theme;

import java.nio.file.Path;
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

/** Bounded owner-control worker; public reads only use its immutable volatile snapshot. */
public final class LoginThemeService implements AutoCloseable {
    private static final Duration DEFAULT_SHUTDOWN_TIMEOUT = Duration.ofSeconds(5);
    private static final String OWNER = "habbux-admin";
    private final LoginThemeStore store;
    private final LoginThemeAssetStorage assets;
    private final ThreadPoolExecutor executor;
    private final AtomicLong rejected = new AtomicLong();
    private volatile LoginThemesSnapshot current;

    public LoginThemeService(LoginThemeStore store, Path assetsDirectory) {
        this.store = Objects.requireNonNull(store, "store");
        assets = new LoginThemeAssetStorage(Objects.requireNonNull(assetsDirectory, "assets directory"));
        current = store.load();
        AtomicInteger sequence = new AtomicInteger();
        ThreadFactory factory = task -> {
            Thread thread = new Thread(task, "habbux-login-theme-control-" + sequence.incrementAndGet());
            thread.setDaemon(false);
            return thread;
        };
        executor = new ThreadPoolExecutor(1, 1, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(4), factory,
                new ThreadPoolExecutor.AbortPolicy());
    }

    private LoginThemeService() {
        store = null;
        assets = null;
        executor = null;
        current = LoginThemesSnapshot.defaults();
    }

    public static LoginThemeService unavailable() { return new LoginThemeService(); }

    public boolean available() { return store != null; }

    public LoginThemesSnapshot current() { return current; }

    public CompletableFuture<LoginThemesSnapshot> activate(LoginThemeId theme) {
        Objects.requireNonNull(theme, "theme");
        return submit(() -> {
            LoginThemesSnapshot saved = store.activate(theme, OWNER);
            current = saved;
            return saved;
        });
    }

    public CompletableFuture<LoginThemeConfiguration> update(LoginThemeConfiguration requested) {
        Objects.requireNonNull(requested, "requested");
        return submit(() -> save(requested, "updated"));
    }

    public CompletableFuture<LoginThemeConfiguration> restore(LoginThemeId theme) {
        Objects.requireNonNull(theme, "theme");
        return submit(() -> {
            LoginThemeConfiguration previous = current.configuration(theme);
            LoginThemeConfiguration defaults = LoginThemeDefaults.configuration(theme)
                    .withAsset("default", previous.version() + 1);
            LoginThemeConfiguration saved = save(defaults, "restored");
            assets.delete(previous.heroAsset());
            return saved;
        });
    }

    public CompletableFuture<LoginThemeConfiguration> upload(LoginThemeId theme, byte[] bytes, String contentType) {
        Objects.requireNonNull(theme, "theme");
        Objects.requireNonNull(bytes, "bytes");
        return submit(() -> {
            LoginThemeConfiguration previous = current.configuration(theme);
            String asset = assets.save(bytes, contentType);
            try {
                LoginThemeConfiguration saved = save(previous.withAsset(asset, previous.version() + 1), "asset_uploaded");
                assets.delete(previous.heroAsset());
                return saved;
            } catch (RuntimeException exception) {
                assets.delete(asset);
                throw exception;
            }
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

    private LoginThemeConfiguration save(LoginThemeConfiguration requested, String action) {
        LoginThemeConfiguration saved = store.save(requested, OWNER, action);
        java.util.EnumMap<LoginThemeId, LoginThemeConfiguration> configurations =
                new java.util.EnumMap<>(current.configurations());
        configurations.put(saved.theme(), saved);
        current = new LoginThemesSnapshot(current.activeTheme(), current.activeVersion(), configurations);
        return saved;
    }

    private <T> CompletableFuture<T> submit(Callable<T> operation) {
        if (!available()) return CompletableFuture.failedFuture(new IllegalStateException("login themes are unavailable"));
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
            try { result.complete(operation.call()); }
            catch (InterruptedException failure) { Thread.currentThread().interrupt(); result.completeExceptionally(failure); }
            catch (Exception failure) { result.completeExceptionally(failure); }
        }

        private void cancel() { result.cancel(false); }
    }
}
