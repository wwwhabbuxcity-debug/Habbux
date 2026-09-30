package com.habbux.room;

import java.util.Arrays;
import java.util.Objects;

/** Compact immutable room geometry. Elevation -1 is void; non-negative values are room tiles. */
public final class RoomModelDefinition {
    private final String id;
    private final int width;
    private final int height;
    private final byte[] elevations;
    private final int doorX;
    private final int doorY;
    private final int doorDirection;
    private final int spawnX;
    private final int spawnY;

    public RoomModelDefinition(String id, int width, int height, byte[] elevations,
                               int doorX, int doorY, int doorDirection) {
        RoomModelValidator.validateDimensions(width, height);
        RoomModelValidator.validateDirection(doorDirection);
        Objects.requireNonNull(id, "id");
        if (id.isBlank() || id.length() > 64 || id.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("room model id is invalid");
        }
        Objects.requireNonNull(elevations, "elevations");
        if (elevations.length != width * height) throw new IllegalArgumentException("room model cell count is invalid");
        for (byte elevation : elevations) {
            if (elevation < -1 || elevation > 35) throw new IllegalArgumentException("room model elevation is invalid");
        }
        if (doorX < 0 || doorX >= width || doorY < 0 || doorY >= height) {
            throw new IllegalArgumentException("room model door is outside the grid");
        }
        this.id = id;
        this.width = width;
        this.height = height;
        this.elevations = elevations.clone();
        this.doorX = doorX;
        this.doorY = doorY;
        this.doorDirection = doorDirection;
        int[] spawn = resolveSpawn();
        spawnX = spawn[0];
        spawnY = spawn[1];
    }

    public String id() { return id; }
    public int width() { return width; }
    public int height() { return height; }
    public int doorX() { return doorX; }
    public int doorY() { return doorY; }
    public int doorDirection() { return doorDirection; }
    public int spawnX() { return spawnX; }
    public int spawnY() { return spawnY; }
    public int elevationAt(int x, int y) {
        if (x < 0 || x >= width || y < 0 || y >= height) return -1;
        return elevations[y * width + x];
    }
    public boolean isWalkable(int x, int y) { return elevationAt(x, y) >= 0; }
    public byte[] elevations() { return elevations.clone(); }

    public RoomGridDefinition toGrid() {
        byte[] walkability = new byte[elevations.length];
        for (int index = 0; index < elevations.length; index++) walkability[index] = (byte) (elevations[index] >= 0 ? 1 : 0);
        return new RoomGridDefinition(width, height, walkability, elevations, spawnX, spawnY,
                id, doorX, doorY, doorDirection);
    }

    private int[] resolveSpawn() {
        if (isWalkable(doorX, doorY)) return new int[] {doorX, doorY};
        int[][] directions = {{0, -1}, {1, 0}, {0, 1}, {-1, 0}, {1, -1}, {1, 1}, {-1, 1}, {-1, -1}};
        int[] preferred = directions[doorDirection == 0 ? 0 : doorDirection == 1 ? 4 : doorDirection == 2 ? 1
                : doorDirection == 3 ? 5 : doorDirection == 4 ? 2 : doorDirection == 5 ? 6 : doorDirection == 6 ? 3 : 7];
        if (isWalkable(doorX + preferred[0], doorY + preferred[1])) return new int[] {doorX + preferred[0], doorY + preferred[1]};
        for (int[] direction : directions) {
            if (isWalkable(doorX + direction[0], doorY + direction[1])) return new int[] {doorX + direction[0], doorY + direction[1]};
        }
        for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) if (isWalkable(x, y)) return new int[] {x, y};
        throw new IllegalArgumentException("room model has no walkable spawn tile");
    }

    @Override public boolean equals(Object other) {
        return other instanceof RoomModelDefinition model && id.equals(model.id) && width == model.width
                && height == model.height && doorX == model.doorX && doorY == model.doorY
                && doorDirection == model.doorDirection && Arrays.equals(elevations, model.elevations);
    }
    @Override public int hashCode() { return 31 * id.hashCode() + Arrays.hashCode(elevations); }
}
