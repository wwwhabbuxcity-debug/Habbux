package com.habbux.room;

/** Central validation boundary for immutable room model definitions. */
public final class RoomModelValidator {
    private RoomModelValidator() { }

    public static void validateDimensions(int width, int height) {
        if (width < 1 || width > RoomGridDefinition.MAX_WIDTH || height < 1 || height > RoomGridDefinition.MAX_HEIGHT) {
            throw new IllegalArgumentException("room model dimensions are outside the supported range");
        }
    }

    public static void validateLocalSpawn(RoomModelDefinition model) {
        if (Math.abs(model.spawnX() - model.doorX()) > 1 || Math.abs(model.spawnY() - model.doorY()) > 1) {
            throw new IllegalArgumentException("room model spawn must be adjacent to door");
        }
    }

    /** Strict import boundary for new original models; legacy research maps remain unchanged. */
    public static void validateConnected(RoomModelDefinition model) {
        if (Math.abs(model.spawnX() - model.doorX()) > 1 || Math.abs(model.spawnY() - model.doorY()) > 1) {
            throw new IllegalArgumentException("room model spawn must be adjacent to door");
        }
        int width = model.width(), count = width * model.height();
        boolean[] seen = new boolean[count];
        int[] queue = new int[count];
        int read = 0, write = 1;
        int start = model.spawnY() * width + model.spawnX();
        queue[0] = start;
        seen[start] = true;
        int[] dx = {0, 1, 0, -1}, dy = {-1, 0, 1, 0};
        while (read < write) {
            int cell = queue[read++], x = cell % width, y = cell / width;
            for (int direction = 0; direction < 4; direction++) {
                int nx = x + dx[direction], ny = y + dy[direction];
                if (!model.isWalkable(nx, ny) || Math.abs(model.elevationAt(nx, ny) - model.elevationAt(x, y)) > 1) continue;
                int next = ny * width + nx;
                if (!seen[next]) { seen[next] = true; queue[write++] = next; }
            }
        }
        for (int y = 0; y < model.height(); y++) for (int x = 0; x < width; x++) {
            if (model.isWalkable(x, y) && !seen[y * width + x]) {
                throw new IllegalArgumentException("room model has disconnected walkable tiles");
            }
        }
    }

    public static void validateDirection(int direction) {
        if (direction < 0 || direction > 7) throw new IllegalArgumentException("room model direction must be 0..7");
    }
}
