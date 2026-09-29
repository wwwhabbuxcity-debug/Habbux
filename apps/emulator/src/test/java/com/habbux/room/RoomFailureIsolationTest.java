package com.habbux.room;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.habbux.user.UserIdentity;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

class RoomFailureIsolationTest {
    @Test
    @Timeout(8)
    void activeRoomContinuesDuringDatabaseOutageWhileNewActivationFailsCleanly() throws Exception {
        RoomId activeRoomId = new RoomId(810);
        RoomId unloadedRoomId = new RoomId(811);
        RoomMetadata activeMetadata = room(activeRoomId, "Active during outage");
        AtomicBoolean databaseAvailable = new AtomicBoolean(true);
        RoomManager manager = new RoomManager(id -> {
            if (!databaseAvailable.get()) throw new IllegalStateException("simulated database outage");
            return id.equals(activeRoomId) ? java.util.Optional.of(activeMetadata) : java.util.Optional.empty();
        }, new RoomConfig(1, 4, 32, 16, 2, 10_000, 1, 4, 16, 8, 100));
        ConcurrentLinkedQueue<RoomOutbound> outgoing = new ConcurrentLinkedQueue<>();
        UUID sessionId = UUID.randomUUID();
        try {
            assertEquals(RoomRuntime.JoinOutcome.JOINED, manager.join(activeRoomId, sessionId,
                    new UserIdentity(810, "outage_user"), outgoing::add).result().get(2, TimeUnit.SECONDS));

            databaseAvailable.set(false);
            assertEquals(RoomRuntime.MoveOutcome.MOVING,
                    manager.move(activeRoomId, sessionId, 1, 0, outgoing::add).get(2, TimeUnit.SECONDS));
            assertEquals(RoomRuntime.ChatOutcome.SENT,
                    manager.chat(activeRoomId, sessionId, "Ainda funcionando", outgoing::add).get(2, TimeUnit.SECONDS));

            assertEquals(RoomRuntime.JoinOutcome.UNAVAILABLE, manager.join(unloadedRoomId, UUID.randomUUID(),
                    new UserIdentity(811, "outage_join"), outgoing::add).result().get(2, TimeUnit.SECONDS));
            RoomManager.MetricsSnapshot metrics = manager.snapshot();
            assertEquals(1, metrics.activeRooms());
            assertEquals(1, metrics.activeRoomUsers());
            assertEquals(1, metrics.joinSuccess());
            assertEquals(1, metrics.joinFailure());
            assertEquals(1, metrics.movementRequests());
            assertEquals(1, metrics.pathfindingSuccess());
            assertEquals(1, metrics.chatMessages());
            assertTrue(metrics.acceptedEvents() > 0);
            assertTrue(metrics.processedEvents() > 0);
            assertTrue(metrics.queueDelayP95Nanos() > 0);
            assertTrue(metrics.movementP95Nanos() > 0);
            assertTrue(outgoing.stream().anyMatch(message -> message instanceof RoomOutbound.ChatMessage));
        } finally {
            assertTrue(manager.close(Duration.ofSeconds(3)));
        }
        RoomManager.MetricsSnapshot afterClose = manager.snapshot();
        assertEquals(0, afterClose.activeRooms());
        assertEquals(0, afterClose.activeRoomUsers());
        assertEquals(1, afterClose.roomActivations());
        assertEquals(1, afterClose.roomUnloads());
        assertEquals(0, afterClose.activeWorkers());
    }

    private static RoomMetadata room(RoomId id, String name) {
        byte[] walkability = new byte[16];
        Arrays.fill(walkability, (byte) 1);
        Instant now = Instant.now();
        return new RoomMetadata(id, 1, name, "", 8,
                new RoomGridDefinition(4, 4, walkability, 0, 0), now, now);
    }
}
