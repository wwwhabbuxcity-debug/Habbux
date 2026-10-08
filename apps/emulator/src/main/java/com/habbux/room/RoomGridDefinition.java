package com.habbux.room;

import java.util.Arrays;
import java.util.Objects;

/** Immutable persisted walkability and spawn data. Runtime occupancy lives in RoomRuntime. */
public final class RoomGridDefinition {
    public static final int MAX_WIDTH = 96;
    public static final int MAX_HEIGHT = 96;
    private final int width;
    private final int height;
    private final byte[] walkable;
    private final byte[] elevations;
    private final int spawnX;
    private final int spawnY;
    private final String modelId;
    private final int doorX;
    private final int doorY;
    private final int doorDirection;

    public RoomGridDefinition(int width, int height, byte[] walkable, int spawnX, int spawnY) {
        this(width, height, walkable, defaultElevations(width, height, walkable), spawnX, spawnY,
                null, spawnX, spawnY, 0);
    }

    public RoomGridDefinition(int width, int height, byte[] walkable, byte[] elevations,
                              int spawnX, int spawnY, String modelId, int doorX, int doorY, int doorDirection) {
        if (width < 1 || width > MAX_WIDTH || height < 1 || height > MAX_HEIGHT) {
            throw new IllegalArgumentException("grid dimensions are outside the supported range");
        }
        Objects.requireNonNull(walkable, "walkable");
        if (walkable.length != width * height) throw new IllegalArgumentException("walkability length must match grid dimensions");
        Objects.requireNonNull(elevations, "elevations");
        if (elevations.length != width * height) throw new IllegalArgumentException("elevation length must match grid dimensions");
        for (byte value : walkable) {
            if (value != 0 && value != 1) throw new IllegalArgumentException("walkability cells must be zero or one");
        }
        for (int index = 0; index < elevations.length; index++) {
            if (elevations[index] < -1 || elevations[index] > 35) throw new IllegalArgumentException("elevation cells must be -1 or 0..35");
            if ((walkable[index] == 1) != (elevations[index] >= 0)) throw new IllegalArgumentException("walkability and elevation disagree");
        }
        if (spawnX < 0 || spawnX >= width || spawnY < 0 || spawnY >= height) {
            throw new IllegalArgumentException("spawn must be inside the grid");
        }
        if (walkable[spawnY * width + spawnX] == 0) throw new IllegalArgumentException("spawn tile must be walkable");
        if (doorX < 0 || doorX >= width || doorY < 0 || doorY >= height || doorDirection < 0 || doorDirection > 7) {
            throw new IllegalArgumentException("door is outside the grid");
        }
        this.width = width;
        this.height = height;
        this.walkable = walkable.clone();
        this.elevations = elevations.clone();
        this.spawnX = spawnX;
        this.spawnY = spawnY;
        this.modelId = modelId;
        this.doorX = doorX;
        this.doorY = doorY;
        this.doorDirection = doorDirection;
    }

    public int width() { return width; }
    public int height() { return height; }
    public int spawnX() { return spawnX; }
    public int spawnY() { return spawnY; }
    public byte[] walkability() { return walkable.clone(); }
    public byte[] elevations() { return elevations.clone(); }
    public String modelId() { return modelId; }
    public int doorX() { return doorX; }
    public int doorY() { return doorY; }
    public int doorDirection() { return doorDirection; }
    public int elevationAt(int x, int y) {
        return x >= 0 && x < width && y >= 0 && y < height ? elevations[y * width + x] : -1;
    }
    public boolean isWalkable(int x, int y) {
        return x >= 0 && x < width && y >= 0 && y < height && walkable[y * width + x] == 1;
    }
    public boolean canTraverse(int fromX, int fromY, int toX, int toY) {
        if (!isWalkable(fromX, fromY) || !isWalkable(toX, toY)
                || Math.abs(elevationAt(fromX, fromY) - elevationAt(toX, toY)) > 1) return false;
        int dx = Integer.compare(toX, fromX);
        int dy = Integer.compare(toY, fromY);
        if (dx != 0 && dy != 0) {
            // Same diagonal rule used by Polaris: reject a corner only when
            // both orthogonal escape tiles are blocked.
            return isWalkable(fromX + dx, fromY) || isWalkable(fromX, fromY + dy);
        }
        return Math.abs(toX - fromX) + Math.abs(toY - fromY) == 1;
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof RoomGridDefinition grid && width == grid.width && height == grid.height
                && spawnX == grid.spawnX && spawnY == grid.spawnY && doorX == grid.doorX && doorY == grid.doorY
                && doorDirection == grid.doorDirection && Objects.equals(modelId, grid.modelId)
                && Arrays.equals(walkable, grid.walkable) && Arrays.equals(elevations, grid.elevations);
    }

    @Override
    public int hashCode() {
        int result = Objects.hash(width, height, spawnX, spawnY);
        return 31 * result + Arrays.hashCode(walkable) + 31 * Arrays.hashCode(elevations);
    }

    private static byte[] defaultElevations(int width, int height, byte[] walkable) {
        if (walkable == null || walkable.length != width * height) throw new IllegalArgumentException("walkability length must match grid dimensions");
        byte[] elevations = new byte[walkable.length];
        for (int index = 0; index < walkable.length; index++) elevations[index] = walkable[index] == 1 ? (byte) 0 : (byte) -1;
        return elevations;
    }
}
