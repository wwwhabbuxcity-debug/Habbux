package com.habbux.room;

/** Immutable room-to-transport messages. No Netty ByteBuf crosses room ownership. */
public sealed interface RoomOutbound permits RoomOutbound.Joined, RoomOutbound.JoinFailed,
        RoomOutbound.Left, RoomOutbound.Snapshot, RoomOutbound.Position, RoomOutbound.ActionFailed,
        RoomOutbound.UserJoined, RoomOutbound.UserLeft, RoomOutbound.ChatMessage, RoomOutbound.Step {
    record Joined(RoomId roomId, int x, int y) implements RoomOutbound { }
    record JoinFailed(JoinFailure reason) implements RoomOutbound { }
    record Left() implements RoomOutbound { }
    record Snapshot(RoomSnapshot snapshot) implements RoomOutbound { }
    record Position(long userId, int x, int y, int z) implements RoomOutbound { }
    record Step(long userId, long sequence, int fromX, int fromY, int fromZ, int x, int y, int z,
                int durationMs, int remainingMs) implements RoomOutbound { }
    record UserJoined(long userId, String username, int x, int y) implements RoomOutbound { }
    record UserLeft(long userId) implements RoomOutbound { }
    record ChatMessage(long userId, String text) implements RoomOutbound { }
    record ActionFailed(ActionOperation operation, ActionFailure reason) implements RoomOutbound {
        public ActionFailed(ActionFailure reason) { this(ActionOperation.MOVE, reason); }
    }

    enum ActionOperation { MOVE, CHAT }
    enum JoinFailure { NOT_FOUND, FULL, ALREADY_IN_ROOM, UNAVAILABLE, MOVEMENT_SUPPORTED }
    enum ActionFailure { NOT_IN_ROOM, INVALID_DESTINATION, UNREACHABLE, PATH_LIMIT,
        INVALID_MESSAGE, RATE_LIMITED, UNAVAILABLE }
}
