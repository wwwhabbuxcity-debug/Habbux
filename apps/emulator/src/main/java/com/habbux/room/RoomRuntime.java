package com.habbux.room;

import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.HashMap;
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
    public enum MoveOutcome { MOVING, ARRIVED, NOT_IN_ROOM, INVALID_DESTINATION, UNREACHABLE, PATH_LIMIT, UNAVAILABLE }
    public enum ChatOutcome { SENT, NOT_IN_ROOM, INVALID_MESSAGE, RATE_LIMITED, UNAVAILABLE }

    private static final int[] DX = {0, -1, 1, 0};
    private static final int[] DY = {-1, 0, 0, 1};
    private static final int MAX_MOVERS_PER_TICK = 16;
    private final RoomMetadata metadata;
    private final RoomMailbox mailbox;
    private final Presence[] occupantByCell;
    private final int[] searchQueue;
    private final int[] searchParent;
    private final int[] searchGenerationByCell;
    private final int maxExploredNodes;
    private final int maxPathLength;
    private final int maxChatBytes;
    private final int maxChatCodePoints;
    private final long chatRateLimitNanos;
    private final LinkedHashMap<UUID, Presence> presences = new LinkedHashMap<>();
    private final HashMap<Long, Presence> presenceByUserId = new HashMap<>();
    private final ArrayDeque<Presence> movingPresences = new ArrayDeque<>();
    private volatile State state = State.LOADING;
    private volatile long lastActivityNanos = System.nanoTime();
    private volatile int presenceCount;
    private volatile int movingCount;
    private int searchGeneration;

    RoomRuntime(RoomMetadata metadata, RoomMailbox mailbox, int maxExploredNodes, int maxPathLength,
                int maxChatBytes, int maxChatCodePoints, int chatRateLimitMillis) {
        this.metadata = java.util.Objects.requireNonNull(metadata, "metadata");
        this.mailbox = java.util.Objects.requireNonNull(mailbox, "mailbox");
        int cellCount = metadata.grid().width() * metadata.grid().height();
        if (maxExploredNodes < 1 || maxPathLength < 1 || maxChatBytes < 1
                || maxChatCodePoints < 1 || chatRateLimitMillis < 1) {
            throw new IllegalArgumentException("room action limits must be positive");
        }
        this.maxExploredNodes = Math.min(maxExploredNodes, cellCount);
        this.maxPathLength = Math.min(maxPathLength, cellCount);
        this.maxChatBytes = Math.min(maxChatBytes, RoomPayloadCodec.MAX_CHAT_BYTES);
        this.maxChatCodePoints = Math.min(maxChatCodePoints, RoomPayloadCodec.MAX_CHAT_CODE_POINTS);
        chatRateLimitNanos = java.util.concurrent.TimeUnit.MILLISECONDS.toNanos(chatRateLimitMillis);
        occupantByCell = new Presence[cellCount];
        searchQueue = new int[cellCount];
        searchParent = new int[cellCount];
        searchGenerationByCell = new int[cellCount];
        state = State.IDLE;
    }

    public RoomId id() { return metadata.id(); }
    public State state() { return state; }
    public long lastActivityNanos() { return lastActivityNanos; }
    public int presenceCount() { return presenceCount; }
    public int movingCount() { return movingCount; }
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
            if (presenceByUserId.containsKey(userId)) {
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
            presenceByUserId.put(userId, joined);
            presenceCount = presences.size();
            occupantByCell[cell] = joined;
            state = State.ACTIVE;
            lastActivityNanos = System.nanoTime();
            for (Presence recipient : presences.values()) {
                if (recipient != joined) recipient.client.send(new RoomOutbound.UserJoined(userId, username, x, y));
            }
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
                presenceByUserId.remove(removed.userId, removed);
                int cell = removed.y * metadata.grid().width() + removed.x;
                occupantByCell[cell] = null;
                if (removed.path != null) {
                    removed.path = null;
                    movingPresences.remove(removed);
                    movingCount = movingPresences.size();
                }
                presenceCount = presences.size();
                lastActivityNanos = System.nanoTime();
                for (Presence recipient : presences.values()) {
                    recipient.client.send(new RoomOutbound.UserLeft(removed.userId));
                }
                if (presences.isEmpty()) state = State.IDLE;
            }
            if (acknowledge) client.send(new RoomOutbound.Left());
            result.complete(null);
        });
        if (!accepted) result.completeExceptionally(new RejectedExecutionException("room mailbox is full or closed"));
        return result;
    }

    CompletableFuture<MoveOutcome> move(UUID sessionId, int x, int y) {
        CompletableFuture<MoveOutcome> result = new CompletableFuture<>();
        boolean accepted = mailbox.submit(() -> {
            Presence presence = presences.get(sessionId);
            if (presence == null) {
                result.complete(MoveOutcome.NOT_IN_ROOM);
                return;
            }
            RoomGridDefinition grid = metadata.grid();
            if (!grid.isWalkable(x, y)) {
                presence.client.send(new RoomOutbound.ActionFailed(RoomOutbound.ActionFailure.INVALID_DESTINATION));
                result.complete(MoveOutcome.INVALID_DESTINATION);
                return;
            }
            int start = presence.y * grid.width() + presence.x;
            int destination = y * grid.width() + x;
            Presence blocker = occupantByCell[destination];
            if (blocker != null && blocker != presence) {
                presence.client.send(new RoomOutbound.ActionFailed(RoomOutbound.ActionFailure.INVALID_DESTINATION));
                result.complete(MoveOutcome.INVALID_DESTINATION);
                return;
            }
            if (start == destination) {
                stopMovement(presence);
                lastActivityNanos = System.nanoTime();
                result.complete(MoveOutcome.ARRIVED);
                return;
            }
            PathResult path = findPath(presence, start, destination);
            if (path.failure != null) {
                presence.client.send(new RoomOutbound.ActionFailed(path.failure));
                result.complete(switch (path.failure) {
                    case NOT_IN_ROOM -> MoveOutcome.NOT_IN_ROOM;
                    case INVALID_DESTINATION -> MoveOutcome.INVALID_DESTINATION;
                    case UNREACHABLE -> MoveOutcome.UNREACHABLE;
                    case PATH_LIMIT -> MoveOutcome.PATH_LIMIT;
                    case UNAVAILABLE -> MoveOutcome.UNAVAILABLE;
                    case INVALID_MESSAGE, RATE_LIMITED -> throw new IllegalStateException("chat failure used for movement");
                });
                return;
            }
            boolean wasMoving = presence.path != null;
            presence.path = path.cells;
            presence.pathIndex = 0;
            if (!wasMoving) movingPresences.addLast(presence);
            movingCount = movingPresences.size();
            lastActivityNanos = System.nanoTime();
            result.complete(MoveOutcome.MOVING);
        });
        if (!accepted) result.complete(MoveOutcome.UNAVAILABLE);
        return result;
    }

    CompletableFuture<ChatOutcome> chat(UUID sessionId, String text, RoomClient client) {
        CompletableFuture<ChatOutcome> result = new CompletableFuture<>();
        boolean accepted = mailbox.submit(() -> {
            Presence presence = presences.get(sessionId);
            if (presence == null) {
                client.send(new RoomOutbound.ActionFailed(RoomOutbound.ActionOperation.CHAT,
                        RoomOutbound.ActionFailure.NOT_IN_ROOM));
                result.complete(ChatOutcome.NOT_IN_ROOM);
                return;
            }
            try {
                RoomPayloadCodec.validateChatText(text, maxChatBytes, maxChatCodePoints);
            } catch (RoomPayloadCodec.MalformedRoomPayloadException invalid) {
                presence.client.send(new RoomOutbound.ActionFailed(RoomOutbound.ActionOperation.CHAT,
                        RoomOutbound.ActionFailure.INVALID_MESSAGE));
                result.complete(ChatOutcome.INVALID_MESSAGE);
                return;
            }
            long now = System.nanoTime();
            if (presence.lastChatNanos != 0 && now - presence.lastChatNanos < chatRateLimitNanos) {
                presence.client.send(new RoomOutbound.ActionFailed(RoomOutbound.ActionOperation.CHAT,
                        RoomOutbound.ActionFailure.RATE_LIMITED));
                result.complete(ChatOutcome.RATE_LIMITED);
                return;
            }
            presence.lastChatNanos = now;
            lastActivityNanos = now;
            RoomOutbound.ChatMessage message = new RoomOutbound.ChatMessage(presence.userId, text);
            for (Presence recipient : presences.values()) recipient.client.send(message);
            result.complete(ChatOutcome.SENT);
        });
        if (!accepted) result.complete(ChatOutcome.UNAVAILABLE);
        return result;
    }

    /** Called by one shared manager ticker; actual mutation still enters this room's mailbox. */
    void tickMovement() {
        if (movingCount == 0 || state != State.ACTIVE) return;
        mailbox.submit(() -> {
            for (int moved = 0; moved < MAX_MOVERS_PER_TICK && !movingPresences.isEmpty(); moved++) {
                Presence presence = movingPresences.removeFirst();
                if (presences.get(presence.sessionId) != presence || presence.path == null) continue;
                int nextCell = presence.path[presence.pathIndex];
                Presence blocker = occupantByCell[nextCell];
                if (blocker != null && blocker != presence) {
                    stopMovement(presence);
                    presence.client.send(new RoomOutbound.ActionFailed(RoomOutbound.ActionFailure.INVALID_DESTINATION));
                    continue;
                }
                int oldCell = presence.y * metadata.grid().width() + presence.x;
                occupantByCell[oldCell] = null;
                presence.x = nextCell % metadata.grid().width();
                presence.y = nextCell / metadata.grid().width();
                occupantByCell[nextCell] = presence;
                RoomOutbound.Position update = new RoomOutbound.Position(presence.userId, presence.x, presence.y, 0);
                for (Presence recipient : presences.values()) recipient.client.send(update);
                presence.pathIndex++;
                lastActivityNanos = System.nanoTime();
                if (presence.pathIndex == presence.path.length) {
                    presence.path = null;
                    presence.pathIndex = 0;
                } else {
                    movingPresences.addLast(presence);
                }
            }
            movingCount = movingPresences.size();
        });
    }

    CompletableFuture<Boolean> unload(Runnable onUnloaded, java.util.function.BooleanSupplier stillIdle) {
        CompletableFuture<Boolean> result = new CompletableFuture<>();
        boolean accepted = mailbox.submitCritical(() -> {
            if (!presences.isEmpty() || !stillIdle.getAsBoolean() || state == State.CLOSED) {
                result.complete(false);
                return;
            }
            state = State.UNLOADING;
            movingPresences.clear();
            movingCount = 0;
            Arrays.fill(occupantByCell, null);
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
            presenceByUserId.clear();
            movingPresences.clear();
            movingCount = 0;
            presenceCount = 0;
            Arrays.fill(occupantByCell, null);
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

    private PathResult findPath(Presence presence, int start, int destination) {
        int generation = nextSearchGeneration();
        int read = 0;
        int write = 0;
        searchQueue[write++] = start;
        searchGenerationByCell[start] = generation;
        searchParent[start] = -1;
        int explored = 0;
        RoomGridDefinition grid = metadata.grid();
        while (read < write) {
            int current = searchQueue[read++];
            if (current == destination) {
                int distance = 0;
                for (int cell = destination; cell != start; cell = searchParent[cell]) distance++;
                if (distance > maxPathLength) return PathResult.failure(RoomOutbound.ActionFailure.PATH_LIMIT);
                int[] path = new int[distance];
                int cell = destination;
                for (int index = distance - 1; index >= 0; index--) {
                    path[index] = cell;
                    cell = searchParent[cell];
                }
                return PathResult.success(path);
            }
            if (explored >= maxExploredNodes) return PathResult.failure(RoomOutbound.ActionFailure.PATH_LIMIT);
            explored++;
            int x = current % grid.width();
            int y = current / grid.width();
            for (int direction = 0; direction < DX.length; direction++) {
                int nx = x + DX[direction];
                int ny = y + DY[direction];
                if (!grid.isWalkable(nx, ny)) continue;
                int next = ny * grid.width() + nx;
                if (searchGenerationByCell[next] == generation) continue;
                Presence blocker = occupantByCell[next];
                if (blocker != null && blocker != presence) continue;
                searchGenerationByCell[next] = generation;
                searchParent[next] = current;
                searchQueue[write++] = next;
            }
        }
        return PathResult.failure(RoomOutbound.ActionFailure.UNREACHABLE);
    }

    private int nextSearchGeneration() {
        if (++searchGeneration == 0) {
            Arrays.fill(searchGenerationByCell, 0);
            searchGeneration = 1;
        }
        return searchGeneration;
    }

    private void stopMovement(Presence presence) {
        if (presence.path == null) return;
        presence.path = null;
        presence.pathIndex = 0;
        movingPresences.remove(presence);
        movingCount = movingPresences.size();
    }

    private int findSpawn() {
        RoomGridDefinition grid = metadata.grid();
        int start = grid.spawnY() * grid.width() + grid.spawnX();
        int generation = nextSearchGeneration();
        int read = 0;
        int write = 0;
        searchQueue[write++] = start;
        searchGenerationByCell[start] = generation;
        while (read < write) {
            int cell = searchQueue[read++];
            int x = cell % grid.width();
            int y = cell / grid.width();
            if (grid.isWalkable(x, y) && occupantByCell[cell] == null) return cell;
            for (int direction = 0; direction < DX.length; direction++) {
                int nx = x + DX[direction];
                int ny = y + DY[direction];
                if (!grid.isWalkable(nx, ny)) continue;
                int next = ny * grid.width() + nx;
                if (searchGenerationByCell[next] != generation) {
                    searchGenerationByCell[next] = generation;
                    searchQueue[write++] = next;
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
        return new RoomSnapshot(metadata.id(), metadata.name(), grid.width(), grid.height(), metadata.capacity(),
                grid.walkability(), occupants);
    }

    private record PathResult(int[] cells, RoomOutbound.ActionFailure failure) {
        private static PathResult success(int[] cells) { return new PathResult(cells, null); }
        private static PathResult failure(RoomOutbound.ActionFailure failure) { return new PathResult(null, failure); }
    }

    private static final class Presence {
        private final UUID sessionId;
        private final long userId;
        private final String username;
        private int x;
        private int y;
        private final RoomClient client;
        private int[] path;
        private int pathIndex;
        private long lastChatNanos;
        private Presence(UUID sessionId, long userId, String username, int x, int y, RoomClient client) {
            this.sessionId = sessionId;
            this.userId = userId;
            this.username = username;
            this.x = x;
            this.y = y;
            this.client = client;
        }
    }
}
