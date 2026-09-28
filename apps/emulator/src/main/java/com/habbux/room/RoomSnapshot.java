package com.habbux.room;

import java.util.List;

/** Bounded immutable initial state sent to a newly joined client. */
public record RoomSnapshot(RoomId roomId, int width, int height, int capacity, byte[] walkability,
                           List<Occupant> occupants) {
    public RoomSnapshot {
        walkability = walkability.clone();
        occupants = List.copyOf(occupants);
    }
    @Override public byte[] walkability() { return walkability.clone(); }
    public record Occupant(long userId, String username, int x, int y) { }
}
