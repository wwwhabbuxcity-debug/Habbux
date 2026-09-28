package com.habbux.room;

/** Immutable room-to-transport messages. No Netty ByteBuf crosses room ownership. */
public sealed interface RoomOutbound permits RoomOutbound.Joined, RoomOutbound.JoinFailed,
        RoomOutbound.Left, RoomOutbound.Snapshot, RoomOutbound.Position, RoomOutbound.ActionFailed {
    record Joined(RoomId roomId, int x, int y) implements RoomOutbound { }
    record JoinFailed(JoinFailure reason) implements RoomOutbound { }
    record Left() implements RoomOutbound { }
    record Snapshot(RoomSnapshot snapshot) implements RoomOutbound { }
    record Position(long userId, int x, int y, int z) implements RoomOutbound { }
    record ActionFailed(ActionFailure reason) implements RoomOutbound { }

    enum JoinFailure { NOT_FOUND, FULL, ALREADY_IN_ROOM, UNAVAILABLE }
    enum ActionFailure { NOT_IN_ROOM, INVALID_DESTINATION, UNREACHABLE, PATH_LIMIT, UNAVAILABLE }
}
