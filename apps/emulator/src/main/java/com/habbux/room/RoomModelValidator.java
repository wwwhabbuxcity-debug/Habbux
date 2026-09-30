package com.habbux.room;

/** Central validation boundary for immutable room model definitions. */
public final class RoomModelValidator {
    private RoomModelValidator() { }

    public static void validateDimensions(int width, int height) {
        if (width < 1 || width > RoomGridDefinition.MAX_WIDTH || height < 1 || height > RoomGridDefinition.MAX_HEIGHT) {
            throw new IllegalArgumentException("room model dimensions are outside the supported range");
        }
    }

    public static void validateDirection(int direction) {
        if (direction < 0 || direction > 7) throw new IllegalArgumentException("room model direction must be 0..7");
    }
}
