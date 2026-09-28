package com.habbux.room;

import java.util.ArrayDeque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;

/** Mutable room state. Every mutation is an event executed by this runtime's mailbox owner. */
public final class RoomRuntime {
    public enum State { LOADING, ACTIVE, IDLE, UNLOADING, CLOSED }
    public enum JoinOutcome { JOINED, CANCELLED, NOT_FOUND, FULL, ALREADY_IN_ROOM, UNAVAILABLE }

    private final RoomMetadata metadata;
    private final RoomMailbox mailbox;
    private final long[] occupantByCell;
    private final LinkedHashMap<UUID, Presence> presences = new LinkedHashMap<>();
    private volatile State state = State.LOADING;
    private volatile long lastActivityNanos = System.nanoTime();
    private volatile int presenceCount;

    RoomRuntime(RoomMetadata metadata, RoomMailbox mailbox) {
        this.metadata = java.util.Objects.requireNonNull(metadata, "metadata");
        this.mailbox = java.util.Objects.requireNonNull(mailbox, "mailbox");
        occupantByCell = new long[metadata.grid().width() * metadata.grid().height()];
        state = State.IDLE;
    }

    public RoomId id() { return metadata.id(); }
    public State state() { return state; }
    public long lastActivityNanos() { return lastActivityNanos; }
    public int presenceCount() { return presenceCount; }
    public int mailboxDepth() { return mailbox.depth(); }

    CompletableFuture<JoinOutcome> join(UUID sessionId, long userId, String username, RoomClient client,
                                        AtomicBoolean cancelled, int maxRoomCapacity) {
        CompletableFuture<JoinOutcome> result = new CompletableFuture<>();
        boolean accepted = mailbox.submit(() -> {
            if (cancelled.get()) { result.complete(JoinOutcome.CANCELLED); return; }
            if (state != State.ACTIVE && state != State.IDLE) {
                client.send(new RoomOutbound.JoinFailed(RoomOutbound.JoinFailure.UNAVAILABLE));
                result.complete(JoinOutcome.UNAVAILABLE);
                return;
            }
            if (presences.containsKey(sessionId)) {
                client.send(new RoomOutbound.JoinFailed(RoomOutbound.JoinFailure.ALREADY_IN_ROOM));
                result.complete(JoinOutcome.ALREADY_IN_ROOM);
                return;
            }
            if (presences.size() >= Math.min(metadata.capacity(), maxRoomCapacity)) {
                client.send(new RoomOutbound.JoinFailed(RoomOutbound.JoinFailure.FULL));
                result.complete(JoinOutcome.FULL);
                return;
            }
            int cell = findSpawn();
            if (cell < 0) {
                client.send(new RoomOutbound.JoinFailed(RoomOutbound.JoinFailure.FULL));
                result.complete(JoinOutcome.FULL);
                return;
            }
            // Cancellation and insertion serialize on the room owner. A disconnect after insertion
            // queues leave behind this event; a disconnect before it is observed here.
            if (cancelled.get()) { result.complete(JoinOutcome.CANCELLED); return; }
            int x = cell % metadata.grid().width();
            int y = cell / metadata.grid().width();
            Presence joined = new Presence(sessionId, userId, username, x, y, client);
            presences.put(sessionId, joined);
            presenceCount = presences.size();
            occupantByCell[cell] = userId;
            state = State.ACTIVE;
            lastActivityNanos = System.nanoTime();
            client.send(new RoomOutbound.Joined(metadata.id(), x, y));
            client.send(new RoomOutbound.Snapshot(snapshot()));
            result.complete(JoinOutcome.JOINED);
        });
        if (!accepted) {
            client.send(new RoomOutbound.JoinFailed(RoomOutbound.JoinFailure.UNAVAILABLE));
            result.complete(JoinOutcome.UNAVAILABLE);
        }
        return result;
    }

    CompletableFuture<Void> leave(UUID sessionId, RoomClient client, boolean acknowledge) {
        CompletableFuture<Void> result = new CompletableFuture<>();
        boolean accepted = mailbox.submitCritical(() -> {
            Presence removed = presences.remove(sessionId);
            if (removed != null) {
                presenceCount = presences.size();
                int cell = removed.y * metadata.grid().width() + removed.x;
                occupantByCell[cell] = 0;
                lastActivityNanos = System.nanoTime();
                if (presences.isEmpty()) state = State.IDLE;
            }
            if (acknowledge) client.send(new RoomOutbound.Left());
            result.complete(null);
        });
        if (!accepted) result.completeExceptionally(new RejectedExecutionException("room mailbox is full or closed"));
        return result;
    }

    CompletableFuture<Boolean> unload(Runnable onUnloaded, java.util.function.BooleanSupplier stillIdle) {
        CompletableFuture<Boolean> result = new CompletableFuture<>();
        boolean accepted = mailbox.submitCritical(() -> {
            if (!presences.isEmpty() || !stillIdle.getAsBoolean() || state == State.CLOSED) {
                result.complete(false);
                return;
            }
            state = State.UNLOADING;
            presences.clear();
            presenceCount = 0;
            java.util.Arrays.fill(occupantByCell, 0);
            state = State.CLOSED;
            onUnloaded.run();
            result.complete(true);
        });
        if (!accepted) result.completeExceptionally(new RejectedExecutionException("room mailbox is full or closed"));
        return result;
    }

    CompletableFuture<Void> closeNow() {
        CompletableFuture<Void> result = new CompletableFuture<>();
        boolean accepted = mailbox.submitCritical(() -> {
            state = State.UNLOADING;
            presences.clear();
            presenceCount = 0;
            java.util.Arrays.fill(occupantByCell, 0);
            state = State.CLOSED;
            mailbox.closeAdmission();
            result.complete(null);
        });
        if (!accepted) {
            mailbox.closeAdmission();
            result.completeExceptionally(new RejectedExecutionException("room mailbox could not accept shutdown"));
        }
        return result;
    }

    private int findSpawn() {
        RoomGridDefinition grid = metadata.grid();
        int start = grid.spawnY() * grid.width() + grid.spawnX();
        boolean[] visited = new boolean[occupantByCell.length];
        int[] queue = new int[occupantByCell.length];
        int read = 0, write = 0;
        queue[write++] = start;
        visited[start] = true;
        int[] dx = {0, -1, 1, 0};
        int[] dy = {-1, 0, 0, 1};
        while (read < write) {
            int cell = queue[read++];
            int x = cell % grid.width(), y = cell / grid.width();
            if (grid.isWalkable(x, y) && occupantByCell[cell] == 0) return cell;
            for (int direction = 0; direction < dx.length; direction++) {
                int nx = x + dx[direction], ny = y + dy[direction];
                if (grid.isWalkable(nx, ny)) {
                    int next = ny * grid.width() + nx;
                    if (!visited[next]) { visited[next] = true; queue[write++] = next; }
                }
            }
        }
        return -1;
    }

    private RoomSnapshot snapshot() {
        List<RoomSnapshot.Occupant> occupants = new java.util.ArrayList<>(presences.size());
        for (Presence presence : presences.values()) {
            occupants.add(new RoomSnapshot.Occupant(presence.userId, presence.username, presence.x, presence.y));
        }
        RoomGridDefinition grid = metadata.grid();
        return new RoomSnapshot(metadata.id(), grid.width(), grid.height(), metadata.capacity(),
                grid.walkability(), occupants);
    }

    private static final class Presence {
        private final long userId;
        private final String username;
        private final int x;
        private final int y;
        private final RoomClient client;
        private Presence(UUID sessionId, long userId, String username, int x, int y, RoomClient client) {
            this.userId = userId;
            this.username = username;
            this.x = x;
            this.y = y;
            this.client = client;
        }
    }
}
