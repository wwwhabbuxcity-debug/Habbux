package com.habbux.admin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class HotelSettingsServiceTest {
    @Test
    void persistsBeforePublishingTheNewReadSnapshot() throws Exception {
        MemoryStore store = new MemoryStore(HotelSettings.defaults());
        try (HotelSettingsService service = new HotelSettingsService(store)) {
            HotelSettings requested = new HotelSettings("Habbux Brasil", "Manutenção às 23h", false, true);
            HotelSettings saved = service.update(requested).get(1, TimeUnit.SECONDS);

            assertEquals(requested, saved);
            assertEquals(requested, store.current);
            assertEquals(requested, service.current());
            assertFalse(service.registrationsEnabled());
            assertTrue(service.maintenanceEnabled());
        }
    }

    @Test
    void rejectsBlankNamesAndOversizedMessages() {
        assertThrows(IllegalArgumentException.class, () -> new HotelSettings("   ", "", true, false));
        assertThrows(IllegalArgumentException.class,
                () -> new HotelSettings("Habbux", "x".repeat(HotelSettings.MAX_MOTD_CODE_POINTS + 1), true, false));
    }

    private static final class MemoryStore implements HotelSettingsStore {
        private HotelSettings current;

        private MemoryStore(HotelSettings current) { this.current = current; }

        @Override
        public HotelSettings load() { return current; }

        @Override
        public HotelSettings save(HotelSettings settings) { return current = settings; }
    }
}
