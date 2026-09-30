package com.habbux.room;

import java.util.List;
import java.util.Objects;

/** Bounded immutable initial state sent to a newly joined client. */
public record RoomSnapshot(RoomId roomId, String name, int width, int height, int capacity, byte[] walkability,
                           byte[] elevations, String modelId, int spawnX, int spawnY,
                           int doorX, int doorY, int doorDirection, List<Occupant> occupants) {
    public RoomSnapshot(RoomId roomId, String name, int width, int height, int capacity, byte[] walkability,
                        List<Occupant> occupants) {
        this(roomId, name, width, height, capacity, walkability, defaultElevations(walkability), null,
                0, 0, 0, 0, 0, occupants);
    }

    public RoomSnapshot {
        Objects.requireNonNull(roomId, "roomId");
        Objects.requireNonNull(name, "name");
        if (width < 1 || width > 96 || height < 1 || height > 96 || capacity < 1 || capacity > 100) {
            throw new IllegalArgumentException("room snapshot dimensions are invalid");
        }
        if (walkability == null || walkability.length != width * height || elevations == null || elevations.length != width * height) {
            throw new IllegalArgumentException("room snapshot grid lengths are invalid");
        }
        if (modelId != null && (modelId.isBlank() || modelId.length() > 64)) throw new IllegalArgumentException("room model id is invalid");
        if (spawnX < 0 || spawnX >= width || spawnY < 0 || spawnY >= height || doorX < 0 || doorX >= width
                || doorY < 0 || doorY >= height || doorDirection < 0 || doorDirection > 7) {
            throw new IllegalArgumentException("room model points are invalid");
        }
        walkability = walkability.clone();
        elevations = elevations.clone();
        occupants = List.copyOf(occupants);
    }
    @Override public byte[] walkability() { return walkability.clone(); }
    @Override public byte[] elevations() { return elevations.clone(); }
    public record Occupant(long userId, String username, int x, int y) { }

    private static byte[] defaultElevations(byte[] walkability) {
        Objects.requireNonNull(walkability, "walkability");
        byte[] elevations = new byte[walkability.length];
        for (int index = 0; index < walkability.length; index++) elevations[index] = walkability[index] == 1 ? (byte) 0 : (byte) -1;
        return elevations;
    }
}
