package com.habbux.room;

import java.util.Arrays;
import java.util.Objects;

/** Immutable persisted walkability and spawn data. Runtime occupancy lives in RoomRuntime. */
public final class RoomGridDefinition {
    public static final int MAX_WIDTH = 64;
    public static final int MAX_HEIGHT = 64;
    private final int width;
    private final int height;
    private final byte[] walkable;
    private final int spawnX;
    private final int spawnY;

    public RoomGridDefinition(int width, int height, byte[] walkable, int spawnX, int spawnY) {
        if (width < 1 || width > MAX_WIDTH || height < 1 || height > MAX_HEIGHT) {
            throw new IllegalArgumentException("grid dimensions are outside the supported range");
        }
        Objects.requireNonNull(walkable, "walkable");
        if (walkable.length != width * height) throw new IllegalArgumentException("walkability length must match grid dimensions");
        for (byte value : walkable) {
            if (value != 0 && value != 1) throw new IllegalArgumentException("walkability cells must be zero or one");
        }
        if (spawnX < 0 || spawnX >= width || spawnY < 0 || spawnY >= height) {
            throw new IllegalArgumentException("spawn must be inside the grid");
        }
        if (walkable[spawnY * width + spawnX] == 0) throw new IllegalArgumentException("spawn tile must be walkable");
        this.width = width;
        this.height = height;
        this.walkable = walkable.clone();
        this.spawnX = spawnX;
        this.spawnY = spawnY;
    }

    public int width() { return width; }
    public int height() { return height; }
    public int spawnX() { return spawnX; }
    public int spawnY() { return spawnY; }
    public byte[] walkability() { return walkable.clone(); }
    public boolean isWalkable(int x, int y) {
        return x >= 0 && x < width && y >= 0 && y < height && walkable[y * width + x] == 1;
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof RoomGridDefinition grid && width == grid.width && height == grid.height
                && spawnX == grid.spawnX && spawnY == grid.spawnY && Arrays.equals(walkable, grid.walkable);
    }

    @Override
    public int hashCode() {
        int result = Objects.hash(width, height, spawnX, spawnY);
        return 31 * result + Arrays.hashCode(walkable);
    }
}
