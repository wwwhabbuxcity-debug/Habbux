package com.habbux.room;

import java.util.Map;

/** Conservative bounded execution defaults. Values are deliberately few and validated centrally. */
public record RoomConfig(int workerCount, int maxActiveRooms, int mailboxCapacity,
                         int eventsPerRun, int maxRunMillis, int idleTimeoutMillis, int maxRoomCapacity,
                         int ioQueueCapacity) {
    public RoomConfig {
        range(workerCount, 1, 8, "workerCount");
        range(maxActiveRooms, 1, 1_024, "maxActiveRooms");
        range(mailboxCapacity, 8, 16_384, "mailboxCapacity");
        range(eventsPerRun, 1, 1_024, "eventsPerRun");
        range(maxRunMillis, 1, 100, "maxRunMillis");
        range(idleTimeoutMillis, 100, 3_600_000, "idleTimeoutMillis");
        range(maxRoomCapacity, 1, RoomMetadata.MAX_CAPACITY, "maxRoomCapacity");
        range(ioQueueCapacity, 1, 4_096, "ioQueueCapacity");
        if (mailboxCapacity < maxRoomCapacity + 10) {
            throw new IllegalArgumentException("mailboxCapacity must reserve room for every leave plus lifecycle events");
        }
    }

    public static RoomConfig defaults() { return new RoomConfig(2, 128, 512, 32, 2, 30_000, 100, 64); }

    public static RoomConfig from(Map<String, String> environment) {
        RoomConfig defaults = defaults();
        return new RoomConfig(value(environment, "HABBUX_ROOM_WORKERS", defaults.workerCount),
                value(environment, "HABBUX_MAX_ACTIVE_ROOMS", defaults.maxActiveRooms),
                value(environment, "HABBUX_ROOM_MAILBOX_CAPACITY", defaults.mailboxCapacity),
                value(environment, "HABBUX_ROOM_EVENTS_PER_RUN", defaults.eventsPerRun),
                value(environment, "HABBUX_ROOM_MAX_RUN_MS", defaults.maxRunMillis),
                value(environment, "HABBUX_ROOM_IDLE_TIMEOUT_MS", defaults.idleTimeoutMillis),
                value(environment, "HABBUX_MAX_ROOM_CAPACITY", defaults.maxRoomCapacity),
                value(environment, "HABBUX_ROOM_IO_QUEUE_CAPACITY", defaults.ioQueueCapacity));
    }

    private static int value(Map<String, String> environment, String key, int fallback) {
        String value = environment.get(key);
        if (value == null || value.isBlank()) return fallback;
        try { return Integer.parseInt(value.strip()); }
        catch (NumberFormatException invalid) { throw new IllegalArgumentException(key + " must be an integer"); }
    }

    private static void range(int value, int min, int max, String name) {
        if (value < min || value > max) throw new IllegalArgumentException(name + " is outside the supported range");
    }
}
