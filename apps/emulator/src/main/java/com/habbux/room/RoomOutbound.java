package com.habbux.room;

/** Immutable room-to-transport messages. No Netty ByteBuf crosses room ownership. */
public sealed interface RoomOutbound permits RoomOutbound.Joined, RoomOutbound.JoinFailed,
        RoomOutbound.Left, RoomOutbound.Snapshot {
    record Joined(RoomId roomId, int x, int y) implements RoomOutbound { }
    record JoinFailed(JoinFailure reason) implements RoomOutbound { }
    record Left() implements RoomOutbound { }
    record Snapshot(RoomSnapshot snapshot) implements RoomOutbound { }

    enum JoinFailure { NOT_FOUND, FULL, ALREADY_IN_ROOM, UNAVAILABLE }
}
