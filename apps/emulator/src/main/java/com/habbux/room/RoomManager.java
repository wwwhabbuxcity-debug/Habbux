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

    public static RoomManager backedBy(com.habbux.persistence.RoomRepository repository,
                                      RoomModelRegistry registry, RoomConfig config) {
        return new RoomManager(new RoomModelRuntime(repository::findById, registry), config);
    }

    public JoinHandle join(RoomId roomId, UUID sessionId, UserIdentity user, RoomClient client) {
        java.util.Objects.requireNonNull(roomId, "roomId");
        java.util.Objects.requireNonNull(sessionId, "sessionId");
        java.util.Objects.requireNonNull(user, "user");
        java.util.Objects.requireNonNull(client, "client");
        JoinHandle handle = new JoinHandle(roomId, sessionId);
        handle.result.whenComplete((outcome, failure) -> {
            metrics.joinLatency.record(Math.max(0, System.nanoTime() - handle.startedAtNanos));
            if (failure == null && outcome == RoomRuntime.JoinOutcome.JOINED) metrics.joinSuccess.increment();
            else metrics.joinFailure.increment();
        });
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
        metrics.leaveCount.increment();
        Slot slot = active.get(roomId);
        if (slot == null) return CompletableFuture.completedFuture(null);
        synchronized (slot.gate) { slot.lastAccessNanos = System.nanoTime(); }
        return slot.loaded.thenCompose(runtime -> runtime.leave(sessionId, client, acknowledge));
    }

    public CompletableFuture<RoomRuntime.MoveOutcome> move(RoomId roomId, UUID sessionId,
                                                           int x, int y, RoomClient client) {
        metrics.movementRequests.increment();
        long startedAtNanos = System.nanoTime();
        Slot slot = active.get(roomId);
        if (slot == null) {
            client.send(new RoomOutbound.ActionFailed(RoomOutbound.ActionFailure.NOT_IN_ROOM));
            metrics.movementLatency.record(Math.max(0, System.nanoTime() - startedAtNanos));
            return CompletableFuture.completedFuture(RoomRuntime.MoveOutcome.NOT_IN_ROOM);
        }
        synchronized (slot.gate) { slot.lastAccessNanos = System.nanoTime(); }
        return slot.loaded.thenCompose(runtime -> runtime.move(sessionId, x, y)).thenApply(outcome -> {
            if (outcome == RoomRuntime.MoveOutcome.NOT_IN_ROOM) {
                client.send(new RoomOutbound.ActionFailed(RoomOutbound.ActionFailure.NOT_IN_ROOM));
            } else if (outcome == RoomRuntime.MoveOutcome.UNAVAILABLE) {
                client.send(new RoomOutbound.ActionFailed(RoomOutbound.ActionFailure.UNAVAILABLE));
            }
            return outcome;
        }).whenComplete((outcome, failure) -> {
            metrics.movementLatency.record(Math.max(0, System.nanoTime() - startedAtNanos));
            if (failure == null && (outcome == RoomRuntime.MoveOutcome.MOVING || outcome == RoomRuntime.MoveOutcome.ARRIVED)) {
                metrics.pathfindingSuccess.increment();
            } else if (outcome == RoomRuntime.MoveOutcome.INVALID_DESTINATION
                    || outcome == RoomRuntime.MoveOutcome.UNREACHABLE || outcome == RoomRuntime.MoveOutcome.PATH_LIMIT) {
                metrics.pathfindingFailure.increment();
            }
        });
    }

    public CompletableFuture<RoomRuntime.ChatOutcome> chat(RoomId roomId, UUID sessionId,
                                                            String text, RoomClient client) {
        Slot slot = active.get(roomId);
        if (slot == null) {
            client.send(new RoomOutbound.ActionFailed(RoomOutbound.ActionOperation.CHAT,
                    RoomOutbound.ActionFailure.NOT_IN_ROOM));
            return CompletableFuture.completedFuture(RoomRuntime.ChatOutcome.NOT_IN_ROOM);
        }
        synchronized (slot.gate) { slot.lastAccessNanos = System.nanoTime(); }
        return slot.loaded.thenCompose(runtime -> runtime.chat(sessionId, text, client)).thenApply(outcome -> {
            if (outcome == RoomRuntime.ChatOutcome.UNAVAILABLE) {
                client.send(new RoomOutbound.ActionFailed(RoomOutbound.ActionOperation.CHAT,
                        RoomOutbound.ActionFailure.UNAVAILABLE));
            }
            return outcome;
        }).whenComplete((outcome, failure) -> {
            if (failure == null && outcome == RoomRuntime.ChatOutcome.SENT) metrics.chatMessages.increment();
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
        int users = 0;
        int mailboxDepth = 0;
        for (Slot slot : active.values()) {
            RoomRuntime runtime = slot.runtime;
            if (runtime != null) {
                users += runtime.presenceCount();
                mailboxDepth += runtime.mailboxDepth();
            }
        }
        return new MetricsSnapshot(active.size(), users, mailboxDepth, room.acceptedEvents(), room.rejectedEvents(),
                room.processedEvents(), room.handlerFailures(), room.averageQueueDelayNanos(), room.maxMailboxDepth(),
                room.queueDelayP50Nanos(), room.queueDelayP95Nanos(), room.queueDelayP99Nanos(),
                room.averageEventDurationNanos(), room.joinSuccess(), room.joinFailure(), room.leaveCount(),
                room.movementRequests(), room.pathfindingSuccess(), room.pathfindingFailure(), room.chatMessages(),
                room.roomActivations(), room.roomUnloads(), room.activeWorkers(), room.maxActiveWorkers(),
                room.joinP50Nanos(), room.joinP95Nanos(), room.joinP99Nanos(), room.movementP50Nanos(),
                room.movementP95Nanos(), room.movementP99Nanos(), scheduler.workerCount(), scheduler.liveWorkerCount());
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
                            config.maxExploredNodes(), config.maxPathLength(), config.maxChatBytes(),
                            config.maxChatCodePoints(), config.chatRateLimitMillis());
                    slot.runtime = runtime;
                    metrics.roomActivations.increment();
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
            if (slot.runtime != null) metrics.roomUnloads.increment();
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
        MetricsSnapshot roomSnapshot = snapshot();
        LOG.atInfo().addKeyValue("event", "room.manager_stopped")
                .addKeyValue("activeRooms", active.size())
                .addKeyValue("activeRoomUsers", roomSnapshot.activeRoomUsers())
                .addKeyValue("mailboxDepth", roomSnapshot.mailboxDepth())
                .addKeyValue("roomEventsQueued", roomSnapshot.acceptedEvents())
                .addKeyValue("roomEventsProcessed", roomSnapshot.processedEvents())
                .addKeyValue("maxMailboxDepth", roomSnapshot.maxMailboxDepth())
                .addKeyValue("workerCount", scheduler.workerCount())
                .addKeyValue("liveWorkers", scheduler.liveWorkerCount())
                .addKeyValue("roomIoTerminated", roomIo.isTerminated())
                .addKeyValue("schedulerStopped", schedulerStopped)
                .addKeyValue("clean", clean)
                .addKeyValue("roomEventsRejected", roomSnapshot.rejectedEvents())
                .addKeyValue("handlerFailures", roomSnapshot.handlerFailures())
                .addKeyValue("queueDelayP50Nanos", roomSnapshot.queueDelayP50Nanos())
                .addKeyValue("queueDelayP95Nanos", roomSnapshot.queueDelayP95Nanos())
                .addKeyValue("queueDelayP99Nanos", roomSnapshot.queueDelayP99Nanos())
                .addKeyValue("averageEventDurationNanos", roomSnapshot.averageEventDurationNanos())
                .addKeyValue("joinP50Nanos", roomSnapshot.joinP50Nanos())
                .addKeyValue("joinP95Nanos", roomSnapshot.joinP95Nanos())
                .addKeyValue("joinP99Nanos", roomSnapshot.joinP99Nanos())
                .addKeyValue("movementP50Nanos", roomSnapshot.movementP50Nanos())
                .addKeyValue("movementP95Nanos", roomSnapshot.movementP95Nanos())
                .addKeyValue("movementP99Nanos", roomSnapshot.movementP99Nanos())
                .addKeyValue("joinSuccess", roomSnapshot.joinSuccess())
                .addKeyValue("joinFailure", roomSnapshot.joinFailure())
                .addKeyValue("leaveCount", roomSnapshot.leaveCount())
                .addKeyValue("movementRequests", roomSnapshot.movementRequests())
                .addKeyValue("pathfindingSuccess", roomSnapshot.pathfindingSuccess())
                .addKeyValue("pathfindingFailure", roomSnapshot.pathfindingFailure())
                .addKeyValue("chatMessages", roomSnapshot.chatMessages())
                .addKeyValue("roomActivations", roomSnapshot.roomActivations())
                .addKeyValue("roomUnloads", roomSnapshot.roomUnloads())
                .addKeyValue("activeWorkers", roomSnapshot.activeWorkers())
                .addKeyValue("maxActiveWorkers", roomSnapshot.maxActiveWorkers())
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
        private final long startedAtNanos = System.nanoTime();
        private final AtomicBoolean cancelled = new AtomicBoolean();
        private final CompletableFuture<RoomRuntime.JoinOutcome> result = new CompletableFuture<>();
        private JoinHandle(RoomId roomId, UUID sessionId) { this.roomId = roomId; this.sessionId = sessionId; }
        public RoomId roomId() { return roomId; }
        public UUID sessionId() { return sessionId; }
        public CompletableFuture<RoomRuntime.JoinOutcome> result() { return result; }
        public void cancel() { cancelled.set(true); }
    }

    public record MetricsSnapshot(int activeRooms, int activeRoomUsers, int mailboxDepth, long acceptedEvents,
                                  long rejectedEvents, long processedEvents, long handlerFailures,
                                  long averageQueueDelayNanos, long maxMailboxDepth, long queueDelayP50Nanos,
                                  long queueDelayP95Nanos, long queueDelayP99Nanos,
                                  long averageEventDurationNanos, long joinSuccess, long joinFailure, long leaveCount,
                                  long movementRequests, long pathfindingSuccess, long pathfindingFailure,
                                  long chatMessages, long roomActivations, long roomUnloads, int activeWorkers,
                                  int maxActiveWorkers, long joinP50Nanos, long joinP95Nanos, long joinP99Nanos,
                                  long movementP50Nanos, long movementP95Nanos, long movementP99Nanos,
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
