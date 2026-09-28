package com.habbux.room;

import com.habbux.user.UserIdentity;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Bounded lazy room directory. Database access is isolated on its own small I/O pool. */
public final class RoomManager implements AutoCloseable {
    private static final Logger LOG = LoggerFactory.getLogger(RoomManager.class);
    private final RoomLoader loader;
    private final RoomConfig config;
    private final RoomMetrics metrics;
    private final RoomScheduler scheduler;
    private final ThreadPoolExecutor roomIo;
    private final ScheduledExecutorService idleSweep;
    private final ConcurrentHashMap<RoomId, Slot> active = new ConcurrentHashMap<>();
    private final Semaphore roomSlots;
    private final AtomicBoolean accepting = new AtomicBoolean(true);

    public RoomManager(RoomLoader loader, RoomConfig config) {
        this.loader = java.util.Objects.requireNonNull(loader, "loader");
        this.config = java.util.Objects.requireNonNull(config, "config");
        metrics = new RoomMetrics();
        roomSlots = new Semaphore(config.maxActiveRooms());
        scheduler = new RoomScheduler(config.workerCount(), config.maxActiveRooms(), metrics);
        ThreadFactory ioThreads = namedFactory("habbux-room-io-");
        roomIo = new ThreadPoolExecutor(2, 2, 0, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(config.ioQueueCapacity()), ioThreads, new ThreadPoolExecutor.AbortPolicy());
        idleSweep = Executors.newSingleThreadScheduledExecutor(namedFactory("habbux-room-control-"));
        long cadence = Math.min(1_000, Math.max(50, config.idleTimeoutMillis() / 4));
        idleSweep.scheduleWithFixedDelay(this::unloadIdleRooms, cadence, cadence, TimeUnit.MILLISECONDS);
        idleSweep.scheduleWithFixedDelay(this::tickMovingRooms, config.movementTickMillis(),
                config.movementTickMillis(), TimeUnit.MILLISECONDS);
    }

    public static RoomManager backedBy(com.habbux.persistence.RoomRepository repository, RoomConfig config) {
        return new RoomManager(repository::findById, config);
    }

    public JoinHandle join(RoomId roomId, UUID sessionId, UserIdentity user, RoomClient client) {
        java.util.Objects.requireNonNull(roomId, "roomId");
        java.util.Objects.requireNonNull(sessionId, "sessionId");
        java.util.Objects.requireNonNull(user, "user");
        java.util.Objects.requireNonNull(client, "client");
        JoinHandle handle = new JoinHandle(roomId, sessionId);
        if (!accepting.get()) {
            failJoin(handle, client, RoomOutbound.JoinFailure.UNAVAILABLE, RoomRuntime.JoinOutcome.UNAVAILABLE);
            return handle;
        }
        joinAfterActivation(handle, user, client);
        return handle;
    }

    private void joinAfterActivation(JoinHandle handle, UserIdentity user, RoomClient client) {
        slotForJoin(handle.roomId).whenComplete((slot, activationFailure) -> {
            if (activationFailure != null) {
                Throwable cause = unwrap(activationFailure);
                RoomOutbound.JoinFailure failure = cause instanceof RoomNotFoundException
                        ? RoomOutbound.JoinFailure.NOT_FOUND : RoomOutbound.JoinFailure.UNAVAILABLE;
                failJoin(handle, client, failure, failure == RoomOutbound.JoinFailure.NOT_FOUND
                        ? RoomRuntime.JoinOutcome.NOT_FOUND : RoomRuntime.JoinOutcome.UNAVAILABLE);
                return;
            }
            if (handle.cancelled.get()) {
                handle.result.complete(RoomRuntime.JoinOutcome.CANCELLED);
                return;
            }
            RoomRuntime runtime;
            synchronized (slot.gate) {
                if (slot.retiring) {
                    slot.lastAccessNanos = System.nanoTime();
                    slot.retirement.handle((ignored, failure) -> null).thenRun(() -> joinAfterActivation(handle, user, client));
                    return;
                }
                slot.lastAccessNanos = System.nanoTime();
                runtime = slot.runtime;
            }
            if (runtime == null) {
                failJoin(handle, client, RoomOutbound.JoinFailure.UNAVAILABLE, RoomRuntime.JoinOutcome.UNAVAILABLE);
                return;
            }
            runtime.join(handle.sessionId, user.id(), user.username(), client, handle.cancelled, config.maxRoomCapacity())
                    .whenComplete((outcome, failure) -> {
                        if (failure != null) handle.result.complete(RoomRuntime.JoinOutcome.UNAVAILABLE);
                        else handle.result.complete(outcome);
                    });
        });
    }

    public CompletableFuture<Void> leave(RoomId roomId, UUID sessionId, RoomClient client, boolean acknowledge) {
        Slot slot = active.get(roomId);
        if (slot == null) return CompletableFuture.completedFuture(null);
        synchronized (slot.gate) { slot.lastAccessNanos = System.nanoTime(); }
        return slot.loaded.thenCompose(runtime -> runtime.leave(sessionId, client, acknowledge));
    }

    public CompletableFuture<RoomRuntime.MoveOutcome> move(RoomId roomId, UUID sessionId,
                                                           int x, int y, RoomClient client) {
        Slot slot = active.get(roomId);
        if (slot == null) {
            client.send(new RoomOutbound.ActionFailed(RoomOutbound.ActionFailure.NOT_IN_ROOM));
            return CompletableFuture.completedFuture(RoomRuntime.MoveOutcome.NOT_IN_ROOM);
        }
        synchronized (slot.gate) { slot.lastAccessNanos = System.nanoTime(); }
        return slot.loaded.thenCompose(runtime -> runtime.move(sessionId, x, y)).thenApply(outcome -> {
            if (outcome == RoomRuntime.MoveOutcome.UNAVAILABLE) {
                client.send(new RoomOutbound.ActionFailed(RoomOutbound.ActionFailure.UNAVAILABLE));
            }
            return outcome;
        });
    }

    void forceIdleSweep() { unloadIdleRooms(); }

    public Optional<RoomRuntime> activeRoom(RoomId roomId) {
        Slot slot = active.get(roomId);
        if (slot == null || !slot.loaded.isDone() || slot.loaded.isCompletedExceptionally()) return Optional.empty();
        return Optional.ofNullable(slot.runtime);
    }

    public MetricsSnapshot snapshot() {
        RoomMetrics.Snapshot room = metrics.snapshot();
        return new MetricsSnapshot(active.size(), room.acceptedEvents(), room.rejectedEvents(), room.processedEvents(),
                room.handlerFailures(), room.averageQueueDelayNanos(), room.maxMailboxDepth(), scheduler.workerCount(),
                scheduler.liveWorkerCount());
    }

    private CompletableFuture<Slot> slotForJoin(RoomId id) {
        if (!accepting.get()) return CompletableFuture.failedFuture(new RejectedExecutionException("room manager is stopping"));
        AtomicBoolean created = new AtomicBoolean();
        Slot slot = active.compute(id, (key, existing) -> {
            if (existing != null) {
                synchronized (existing.gate) { existing.lastAccessNanos = System.nanoTime(); }
                return existing;
            }
            if (!roomSlots.tryAcquire()) return null;
            created.set(true);
            return new Slot(System.nanoTime());
        });
        if (slot == null) return CompletableFuture.failedFuture(new RejectedExecutionException("active room limit reached"));
        if (!created.get()) return slot.loaded.thenApply(ignored -> slot);
        try {
            roomIo.execute(() -> {
                try {
                    Optional<RoomMetadata> found = loader.findById(id);
                    if (found.isEmpty()) throw new RoomNotFoundException();
                    RoomMetadata metadata = found.orElseThrow();
                    RoomRuntime runtime = new RoomRuntime(metadata, scheduler.newMailbox(config.mailboxCapacity(),
                            config.maxRoomCapacity() + 2, config.eventsPerRun(),
                            TimeUnit.MILLISECONDS.toNanos(config.maxRunMillis())),
                            config.maxExploredNodes(), config.maxPathLength());
                    slot.runtime = runtime;
                    slot.loaded.complete(runtime);
                } catch (Throwable failure) {
                    removeSlot(id, slot);
                    slot.loaded.completeExceptionally(failure);
                }
            });
        } catch (RejectedExecutionException rejected) {
            removeSlot(id, slot);
            slot.loaded.completeExceptionally(rejected);
        }
        return slot.loaded.thenApply(ignored -> slot);
    }

    private void removeSlot(RoomId id, Slot slot) {
        if (active.remove(id, slot)) {
            roomSlots.release();
        }
    }

    void tickMovingRooms() {
        if (!accepting.get()) return;
        for (Slot slot : active.values()) {
            RoomRuntime runtime = slot.runtime;
            if (runtime != null && runtime.movingCount() != 0) runtime.tickMovement();
        }
    }

    private void unloadIdleRooms() {
        if (!accepting.get()) return;
        long now = System.nanoTime();
        long timeout = TimeUnit.MILLISECONDS.toNanos(config.idleTimeoutMillis());
        for (Map.Entry<RoomId, Slot> entry : active.entrySet()) {
            Slot slot = entry.getValue();
            synchronized (slot.gate) {
                if (slot.retiring || slot.runtime == null || slot.runtime.presenceCount() != 0
                        || now - slot.lastAccessNanos < timeout) continue;
                slot.retiring = true;
                slot.retirement = new CompletableFuture<>();
            }
            slot.runtime.unload(() -> {
                synchronized (slot.gate) {
                    removeSlot(entry.getKey(), slot);
                    slot.retirement.complete(null);
                }
            }, () -> {
                synchronized (slot.gate) {
                    if (System.nanoTime() - slot.lastAccessNanos < timeout
                            || System.nanoTime() - slot.runtime.lastActivityNanos() < timeout) {
                        slot.retiring = false;
                        slot.retirement.complete(null);
                        return false;
                    }
                    return true;
                }
            }).whenComplete((unloaded, failure) -> {
                if (failure != null || !Boolean.TRUE.equals(unloaded)) {
                    synchronized (slot.gate) {
                        slot.retiring = false;
                        slot.retirement.complete(null);
                    }
                }
            });
        }
    }

    private static void failJoin(JoinHandle handle, RoomClient client, RoomOutbound.JoinFailure failure,
                                 RoomRuntime.JoinOutcome outcome) {
        if (!handle.cancelled.get()) client.send(new RoomOutbound.JoinFailed(failure));
        handle.result.complete(outcome);
    }

    private static Throwable unwrap(Throwable failure) {
        return failure instanceof java.util.concurrent.CompletionException && failure.getCause() != null
                ? failure.getCause() : failure;
    }

    private static ThreadFactory namedFactory(String prefix) {
        AtomicInteger index = new AtomicInteger();
        return task -> {
            Thread thread = new Thread(task, prefix + index.incrementAndGet());
            thread.setDaemon(false);
            return thread;
        };
    }

    public boolean close(Duration timeout) {
        if (!accepting.compareAndSet(true, false)) return true;
        idleSweep.shutdownNow();
        roomIo.shutdown();
        long deadline = System.nanoTime() + timeout.toNanos();
        boolean clean = await(idleSweep, deadline) && await(roomIo, deadline);
        for (Map.Entry<RoomId, Slot> entry : active.entrySet()) {
            Slot slot = entry.getValue();
            if (slot.runtime == null) continue;
            try {
                long remaining = deadline - System.nanoTime();
                if (remaining <= 0) { clean = false; break; }
                slot.runtime.closeNow().get(remaining, TimeUnit.NANOSECONDS);
                removeSlot(entry.getKey(), slot);
            } catch (Exception failure) {
                clean = false;
            }
        }
        boolean schedulerStopped = scheduler.close(Duration.ofNanos(Math.max(1, deadline - System.nanoTime())));
        clean &= schedulerStopped;
        if (!active.isEmpty()) clean = false;
        LOG.atInfo().addKeyValue("event", "room.manager_stopped")
                .addKeyValue("activeRooms", active.size())
                .addKeyValue("workerCount", scheduler.workerCount())
                .addKeyValue("liveWorkers", scheduler.liveWorkerCount())
                .addKeyValue("roomIoTerminated", roomIo.isTerminated())
                .addKeyValue("schedulerStopped", schedulerStopped)
                .addKeyValue("clean", clean)
                .addKeyValue("rejectedEvents", metrics.snapshot().rejectedEvents())
                .log("Habbux Room Manager stopped");
        return clean;
    }

    private static boolean await(ThreadPoolExecutor executor, long deadline) {
        return await((java.util.concurrent.ExecutorService) executor, deadline);
    }

    private static boolean await(java.util.concurrent.ExecutorService executor, long deadline) {
        try {
            long remaining = deadline - System.nanoTime();
            return remaining > 0 && executor.awaitTermination(remaining, TimeUnit.NANOSECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    @Override public void close() {
        if (!close(Duration.ofSeconds(10))) throw new IllegalStateException("Habbux room manager shutdown did not finish cleanly");
    }

    public final class JoinHandle {
        private final RoomId roomId;
        private final UUID sessionId;
        private final AtomicBoolean cancelled = new AtomicBoolean();
        private final CompletableFuture<RoomRuntime.JoinOutcome> result = new CompletableFuture<>();
        private JoinHandle(RoomId roomId, UUID sessionId) { this.roomId = roomId; this.sessionId = sessionId; }
        public RoomId roomId() { return roomId; }
        public UUID sessionId() { return sessionId; }
        public CompletableFuture<RoomRuntime.JoinOutcome> result() { return result; }
        public void cancel() { cancelled.set(true); }
    }

    public record MetricsSnapshot(int activeRooms, long acceptedEvents, long rejectedEvents, long processedEvents,
                                  long handlerFailures, long averageQueueDelayNanos, long maxMailboxDepth,
                                  int workerCount, int liveWorkers) { }

    private static final class Slot {
        private final Object gate = new Object();
        private final CompletableFuture<RoomRuntime> loaded = new CompletableFuture<>();
        private volatile RoomRuntime runtime;
        private volatile long lastAccessNanos;
        private boolean retiring;
        private CompletableFuture<Void> retirement = CompletableFuture.completedFuture(null);
        private Slot(long now) { lastAccessNanos = now; }
    }

    private static final class RoomNotFoundException extends RuntimeException {
        private static final long serialVersionUID = 1L;
    }
}
