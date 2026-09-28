package com.habbux.session;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.habbux.room.RoomConfig;
import com.habbux.room.RoomGridDefinition;
import com.habbux.room.RoomManager;
import com.habbux.room.RoomMetadata;
import com.habbux.room.RoomRuntime;
import com.habbux.user.UserIdentity;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

class SessionRoomMembershipTest {
    @Test
    @Timeout(8)
    void disconnectDuringDatabaseActivationCancelsJoinAndDrainsPresence() throws Exception {
        CountDownLatch loading = new CountDownLatch(1);
        CountDownLatch releaseLoader = new CountDownLatch(1);
        byte[] cells = new byte[16];
        Arrays.fill(cells, (byte) 1);
        Instant now = Instant.now();
        RoomMetadata room = new RoomMetadata(new com.habbux.room.RoomId(66), 1,
                "Disconnect race", "", 8, new RoomGridDefinition(4, 4, cells, 0, 0), now, now);
        RoomManager manager = new RoomManager(id -> {
            loading.countDown();
            try {
                if (!releaseLoader.await(2, TimeUnit.SECONDS)) throw new IllegalStateException("test database loader timed out");
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(interrupted);
            }
            return java.util.Optional.of(room);
        }, new RoomConfig(1, 8, 32, 8, 2, 10_000, 8, 8));
        ConnectionRegistry registry = new ConnectionRegistry(1);
        Session session = registry.tryConnect();
        session.transition(Session.State.CONNECTED, Session.State.HANDSHAKING);
        session.transition(Session.State.HANDSHAKING, Session.State.READY);
        session.transition(Session.State.READY, Session.State.AUTHENTICATING);
        assertTrue(session.authenticate(new UserIdentity(7, "alice")));
        try {
            RoomManager.JoinHandle handle = manager.join(room.id(), session.id(), session.principal(), ignored -> { });
            assertTrue(session.beginRoomJoin(handle));
            assertTrue(loading.await(1, TimeUnit.SECONDS));
            Session.RoomMembership detached = session.detachRoom();
            assertNotNull(detached.joinHandle());
            assertEquals(Session.RoomState.NONE, session.roomState());
            var pendingLeave = manager.leave(room.id(), session.id(), ignored -> { }, false);
            assertTrue(registry.remove(session.id()));
            assertEquals(Session.State.DISCONNECTED, session.state());
            releaseLoader.countDown();
            assertEquals(RoomRuntime.JoinOutcome.CANCELLED, handle.result().get(3, TimeUnit.SECONDS));
            pendingLeave.get(3, TimeUnit.SECONDS);
            assertEquals(0, manager.activeRoom(room.id()).orElseThrow().presenceCount());
            assertEquals(0, registry.activeSessions());
            assertFalse(session.principal() != null);
        } finally {
            releaseLoader.countDown();
            assertTrue(manager.close(Duration.ofSeconds(5)));
        }
    }
}
