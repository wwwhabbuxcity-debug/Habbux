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
                "HABBUX_MAX_ACTIVE_ROOMS", "32", "HABBUX_ROOM_MAX_RUN_MS", "5",
                "HABBUX_ROOM_MAX_EXPLORED_NODES", "2048", "HABBUX_ROOM_MAX_PATH_LENGTH", "64",
                "HABBUX_ROOM_MOVEMENT_TICK_MS", "50", "HABBUX_ROOM_MAX_CHAT_BYTES", "128",
                "HABBUX_ROOM_MAX_CHAT_CODE_POINTS", "64", "HABBUX_ROOM_CHAT_RATE_MS", "750"));
        assertEquals(4, configured.workerCount());
        assertEquals(32, configured.maxActiveRooms());
        assertEquals(5, configured.maxRunMillis());
        assertEquals(2_048, configured.maxExploredNodes());
        assertEquals(64, configured.maxPathLength());
        assertEquals(50, configured.movementTickMillis());
        assertEquals(128, configured.maxChatBytes());
        assertEquals(64, configured.maxChatCodePoints());
        assertEquals(750, configured.chatRateLimitMillis());
    }

    @Test
    void rejectsUnboundedOrMalformedValues() {
        assertThrows(IllegalArgumentException.class,
                () -> new RoomConfig(0, 1, 8, 1, 1, 100, 1, 1));
        assertThrows(IllegalArgumentException.class,
                () -> new RoomConfig(1, 1, 8, 1, 101, 100, 1, 1));
        assertThrows(IllegalArgumentException.class,
                () -> RoomConfig.from(Map.of("HABBUX_ROOM_WORKERS", "many")));
        assertThrows(IllegalArgumentException.class,
                () -> new RoomConfig(1, 1, 16, 1, 1, 100, 1, 1, 4_097, 1, 100));
        assertThrows(IllegalArgumentException.class,
                () -> new RoomConfig(1, 1, 16, 1, 1, 100, 1, 1, 1, 1, 9));
        assertThrows(IllegalArgumentException.class,
                () -> RoomConfig.from(Map.of("HABBUX_ROOM_MAX_CHAT_BYTES", "257")));
        assertThrows(IllegalArgumentException.class,
                () -> RoomConfig.from(Map.of("HABBUX_ROOM_CHAT_RATE_MS", "60001")));
    }
}
