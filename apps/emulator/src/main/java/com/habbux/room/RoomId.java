package com.habbux.room;

/** Positive PostgreSQL BIGINT room identifier used on the wire and in hot-path maps. */
public record RoomId(long value) implements Comparable<RoomId> {
    public RoomId {
        if (value <= 0) throw new IllegalArgumentException("room id must be positive");
    }

    @Override
    public int compareTo(RoomId other) { return Long.compare(value, other.value); }
}
