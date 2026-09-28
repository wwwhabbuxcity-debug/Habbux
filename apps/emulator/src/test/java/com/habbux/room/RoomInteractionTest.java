package com.habbux.room;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.habbux.user.UserIdentity;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

class RoomInteractionTest {
    @Test
    @Timeout(8)
    void joinLeaveAndChatBroadcastInRoomOrderWithRateAndTextLimits() throws Exception {
        byte[] walkability = new byte[16];
        Arrays.fill(walkability, (byte) 1);
        Instant now = Instant.now();
        RoomMetadata room = new RoomMetadata(new RoomId(100), 1, "Interaction Test", "", 4,
                new RoomGridDefinition(4, 4, walkability, 0, 0), now, now);
        RoomManager manager = new RoomManager(id -> java.util.Optional.of(room),
                new RoomConfig(1, 4, 32, 16, 2, 10_000, 4, 8, 4_096, 128, 100,
                        256, 128, 60_000));
        UUID alice = UUID.randomUUID();
        UUID bob = UUID.randomUUID();
        BlockingQueue<RoomOutbound> aliceOutput = new LinkedBlockingQueue<>();
        BlockingQueue<RoomOutbound> bobOutput = new LinkedBlockingQueue<>();
        try {
            join(manager, room, alice, 1, "alice", aliceOutput::add);
            assertInstanceOf(RoomOutbound.Joined.class, aliceOutput.poll(1, TimeUnit.SECONDS));
            RoomOutbound.Snapshot aliceSnapshot = assertInstanceOf(RoomOutbound.Snapshot.class,
                    aliceOutput.poll(1, TimeUnit.SECONDS));
            assertEquals("Interaction Test", aliceSnapshot.snapshot().name());
            assertEquals(List.of("alice"), aliceSnapshot.snapshot().occupants().stream()
                    .map(RoomSnapshot.Occupant::username).toList());

            join(manager, room, bob, 2, "bob", bobOutput::add);
            assertInstanceOf(RoomOutbound.Joined.class, bobOutput.poll(1, TimeUnit.SECONDS));
            RoomOutbound.Snapshot bobSnapshot = assertInstanceOf(RoomOutbound.Snapshot.class,
                    bobOutput.poll(1, TimeUnit.SECONDS));
            assertEquals(List.of("alice", "bob"), bobSnapshot.snapshot().occupants().stream()
                    .map(RoomSnapshot.Occupant::username).toList());
            RoomOutbound.UserJoined presence = assertInstanceOf(RoomOutbound.UserJoined.class,
                    aliceOutput.poll(1, TimeUnit.SECONDS));
            assertEquals(2, presence.userId());

            assertEquals(RoomRuntime.ChatOutcome.INVALID_MESSAGE,
                    manager.chat(room.id(), alice, "\n", aliceOutput::add).get(1, TimeUnit.SECONDS));
            RoomOutbound.ActionFailed invalid = assertInstanceOf(RoomOutbound.ActionFailed.class,
                    aliceOutput.poll(1, TimeUnit.SECONDS));
            assertEquals(RoomOutbound.ActionOperation.CHAT, invalid.operation());
            assertEquals(RoomOutbound.ActionFailure.INVALID_MESSAGE, invalid.reason());

            assertEquals(RoomRuntime.ChatOutcome.SENT,
                    manager.chat(room.id(), bob, "Olá 🏠", bobOutput::add).get(1, TimeUnit.SECONDS));
            RoomOutbound.ChatMessage bobChat = assertInstanceOf(RoomOutbound.ChatMessage.class,
                    bobOutput.poll(1, TimeUnit.SECONDS));
            RoomOutbound.ChatMessage aliceChat = assertInstanceOf(RoomOutbound.ChatMessage.class,
                    aliceOutput.poll(1, TimeUnit.SECONDS));
            assertEquals("Olá 🏠", bobChat.text());
            assertEquals(bobChat, aliceChat);

            assertEquals(RoomRuntime.ChatOutcome.RATE_LIMITED,
                    manager.chat(room.id(), bob, "segunda", bobOutput::add).get(1, TimeUnit.SECONDS));
            RoomOutbound.ActionFailed rateLimit = assertInstanceOf(RoomOutbound.ActionFailed.class,
                    bobOutput.poll(1, TimeUnit.SECONDS));
            assertEquals(RoomOutbound.ActionFailure.RATE_LIMITED, rateLimit.reason());
            assertNull(aliceOutput.poll(50, TimeUnit.MILLISECONDS));

            manager.leave(room.id(), bob, bobOutput::add, true).get(1, TimeUnit.SECONDS);
            assertInstanceOf(RoomOutbound.Left.class, bobOutput.poll(1, TimeUnit.SECONDS));
            RoomOutbound.UserLeft departure = assertInstanceOf(RoomOutbound.UserLeft.class,
                    aliceOutput.poll(1, TimeUnit.SECONDS));
            assertEquals(2, departure.userId());
            assertEquals(1, manager.activeRoom(room.id()).orElseThrow().presenceCount());
        } finally {
            assertTrue(manager.close(Duration.ofSeconds(3)));
        }
    }

    private static void join(RoomManager manager, RoomMetadata room, UUID sessionId,
                             long userId, String username, RoomClient client) throws Exception {
        RoomManager.JoinHandle join = manager.join(room.id(), sessionId,
                new UserIdentity(userId, username), client);
        assertEquals(RoomRuntime.JoinOutcome.JOINED, join.result().get(1, TimeUnit.SECONDS));
    }
}
