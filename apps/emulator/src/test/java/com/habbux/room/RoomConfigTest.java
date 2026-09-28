package com.habbux.room;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.Map;
import org.junit.jupiter.api.Test;

class RoomConfigTest {
    @Test
    void providesBoundedDefaultsAndParsesRoomSpecificEnvironment() {
        assertEquals(new RoomConfig(2, 128, 512, 32, 2, 30_000, 100, 64), RoomConfig.from(Map.of()));
        RoomConfig configured = RoomConfig.from(Map.of("HABBUX_ROOM_WORKERS", "4",
                "HABBUX_MAX_ACTIVE_ROOMS", "32", "HABBUX_ROOM_MAX_RUN_MS", "5"));
        assertEquals(4, configured.workerCount());
        assertEquals(32, configured.maxActiveRooms());
        assertEquals(5, configured.maxRunMillis());
    }

    @Test
    void rejectsUnboundedOrMalformedValues() {
        assertThrows(IllegalArgumentException.class,
                () -> new RoomConfig(0, 1, 8, 1, 1, 100, 1, 1));
        assertThrows(IllegalArgumentException.class,
                () -> new RoomConfig(1, 1, 8, 1, 101, 100, 1, 1));
        assertThrows(IllegalArgumentException.class,
                () -> RoomConfig.from(Map.of("HABBUX_ROOM_WORKERS", "many")));
    }
}
