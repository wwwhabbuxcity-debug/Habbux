package com.habbux.room;

import java.time.Instant;
import java.util.Objects;

/** Small persisted room definition; it contains no runtime users or movement state. */
public record RoomMetadata(RoomId id, long ownerUserId, String name, String description,
                           int capacity, RoomGridDefinition grid, Instant createdAt, Instant updatedAt) {
    public static final int MAX_CAPACITY = 100;
    public static final int MAX_NAME_UTF8_BYTES = 128;
    public RoomMetadata {
        Objects.requireNonNull(id, "id");
        if (ownerUserId <= 0) throw new IllegalArgumentException("owner user id must be positive");
        requireUtf8(name, 1, MAX_NAME_UTF8_BYTES, "room name");
        requireUtf8(description, 0, 512, "room description");
        if (capacity < 1 || capacity > MAX_CAPACITY) throw new IllegalArgumentException("capacity is outside the supported range");
        Objects.requireNonNull(grid, "grid");
        Objects.requireNonNull(createdAt, "createdAt");
        Objects.requireNonNull(updatedAt, "updatedAt");
    }

    public static void requireUtf8(String value, int minBytes, int maxBytes, String label) {
        Objects.requireNonNull(value, label);
        int bytes = value.getBytes(java.nio.charset.StandardCharsets.UTF_8).length;
        if (bytes < minBytes || bytes > maxBytes || value.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException(label + " is outside the supported range");
        }
    }
}
