package com.habbux.room;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.habbux.user.UserIdentity;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;

class RoomManagerTest {
    @Test
    @Timeout(15)
    void oneHundredSimultaneousJoinsShareOneActivationAndNeverShareSpawnTiles() throws Exception {
        AtomicInteger loads = new AtomicInteger();
        RoomMetadata metadata = metadata(44, 100, openGrid(10, 10));
        RoomManager manager = manager(id -> { loads.incrementAndGet(); return java.util.Optional.of(metadata); }, 2, 10_000);
        try {
            int count = 100;
            CountDownLatch start = new CountDownLatch(1);
            ExecutorService callers = Executors.newFixedThreadPool(16);
            try {
                List<java.util.concurrent.Future<RoomRuntime.JoinOutcome>> joins = new ArrayList<>();
                Set<String> positions = ConcurrentHashMap.newKeySet();
                for (int index = 0; index < count; index++) {
                    int user = index + 1;
                    joins.add(callers.submit(() -> {
                        start.await();
                        RoomClient client = message -> {
                            if (message instanceof RoomOutbound.Joined joined) {
                                positions.add(joined.x() + "," + joined.y());
                            }
                        };
                        RoomManager.JoinHandle handle = manager.join(metadata.id(), UUID.randomUUID(),
                                new UserIdentity(user, "user_" + user), client);
                        return handle.result().get(5, TimeUnit.SECONDS);
                    }));
                }
                start.countDown();
                for (var join : joins) assertEquals(RoomRuntime.JoinOutcome.JOINED, join.get(7, TimeUnit.SECONDS),
                        "presence=" + manager.activeRoom(metadata.id()).map(RoomRuntime::presenceCount).orElse(-1)
                                + ", successfulSpawnMessages=" + positions.size());
                assertEquals(1, loads.get());
                assertEquals(100, positions.size());
                RoomRuntime runtime = manager.activeRoom(metadata.id()).orElseThrow();
                assertEquals(100, runtime.presenceCount());
                assertEquals(1, manager.snapshot().activeRooms());
                assertEquals(2, manager.snapshot().workerCount());
            } finally {
                callers.shutdownNow();
                callers.awaitTermination(2, TimeUnit.SECONDS);
            }
        } finally {
            assertTrue(manager.close(Duration.ofSeconds(5)));
        }
        assertEquals(0, manager.snapshot().activeRooms());
        assertEquals(0, manager.snapshot().liveWorkers());
    }

    @Test
    @Timeout(10)
    void disconnectDuringActivationCancelsPendingJoinWithoutLeavingPresence() throws Exception {
        CountDownLatch loading = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        RoomMetadata metadata = metadata(45, 10, openGrid(4, 4));
        RoomManager manager = manager(id -> {
            loading.countDown();
            try { if (!release.await(2, TimeUnit.SECONDS)) throw new IllegalStateException("test loader timed out"); }
            catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted); }
            return java.util.Optional.of(metadata);
        }, 1, 10_000);
        try {
            RoomManager.JoinHandle handle = manager.join(metadata.id(), UUID.randomUUID(), new UserIdentity(1, "alice"), ignored -> { });
            assertTrue(loading.await(1, TimeUnit.SECONDS));
            handle.cancel();
            release.countDown();
            assertEquals(RoomRuntime.JoinOutcome.CANCELLED, handle.result().get(3, TimeUnit.SECONDS));
            assertEquals(0, manager.activeRoom(metadata.id()).orElseThrow().presenceCount());
        } finally {
            release.countDown();
            assertTrue(manager.close(Duration.ofSeconds(5)));
        }
    }

    @Test
    @Timeout(10)
    void rejoinDuringIdleUnloadCancelsRetirementWithoutCreatingDuplicateRuntime() throws Exception {
        AtomicInteger loads = new AtomicInteger();
        RoomMetadata metadata = metadata(46, 10, openGrid(4, 4));
        RoomManager manager = manager(id -> { loads.incrementAndGet(); return java.util.Optional.of(metadata); }, 1, 100);
        CountDownLatch leaveOutput = new CountDownLatch(1);
        CountDownLatch unblockLeave = new CountDownLatch(1);
        try {
            UUID session = UUID.randomUUID();
            RoomManager.JoinHandle initial = manager.join(metadata.id(), session,
                    new UserIdentity(1, "alice"), ignored -> { });
            assertEquals(RoomRuntime.JoinOutcome.JOINED, initial.result().get(2, TimeUnit.SECONDS));
            RoomRuntime original = manager.activeRoom(metadata.id()).orElseThrow();
            var leaving = manager.leave(metadata.id(), session, message -> {
                if (message instanceof RoomOutbound.Left) {
                    leaveOutput.countDown();
                    try { unblockLeave.await(2, TimeUnit.SECONDS); }
                    catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
                }
            }, true);
            assertTrue(leaveOutput.await(1, TimeUnit.SECONDS));
            Thread.sleep(120);
            manager.forceIdleSweep();
            RoomManager.JoinHandle rejoin = manager.join(metadata.id(), UUID.randomUUID(),
                    new UserIdentity(2, "bob"), ignored -> { });
            unblockLeave.countDown();
            leaving.get(2, TimeUnit.SECONDS);
            assertEquals(RoomRuntime.JoinOutcome.JOINED, rejoin.result().get(3, TimeUnit.SECONDS));
            assertSame(original, manager.activeRoom(metadata.id()).orElseThrow());
            assertEquals(1, loads.get());
            assertEquals(1, manager.activeRoom(metadata.id()).orElseThrow().presenceCount());
        } finally {
            unblockLeave.countDown();
            assertTrue(manager.close(Duration.ofSeconds(5)));
        }
    }

    @Test
    @Timeout(5)
    void absentRoomReturnsNotFoundAndReleasesDirectoryReservation() throws Exception {
        RoomManager manager = manager(id -> java.util.Optional.empty(), 1, 10_000);
        try {
            RoomManager.JoinHandle handle = manager.join(new RoomId(999), UUID.randomUUID(),
                    new UserIdentity(1, "alice"), ignored -> { });
            assertEquals(RoomRuntime.JoinOutcome.NOT_FOUND, handle.result().get(2, TimeUnit.SECONDS));
            assertEquals(0, manager.snapshot().activeRooms());
        } finally {
            assertTrue(manager.close(Duration.ofSeconds(5)));
        }
    }

    @Test
    @Timeout(8)
    void doubleLeaveReleasesOccupancyAndAllowsTheOnlyTileToBeReused() throws Exception {
        RoomMetadata metadata = metadata(47, 1, openGrid(1, 1));
        RoomManager manager = manager(id -> java.util.Optional.of(metadata), 1, 10_000);
        try {
            UUID firstSession = UUID.randomUUID();
            RoomManager.JoinHandle first = manager.join(metadata.id(), firstSession,
                    new UserIdentity(1, "alice"), ignored -> { });
            assertEquals(RoomRuntime.JoinOutcome.JOINED, first.result().get(2, TimeUnit.SECONDS));
            manager.leave(metadata.id(), firstSession, ignored -> { }, true).get(2, TimeUnit.SECONDS);
            manager.leave(metadata.id(), firstSession, ignored -> { }, true).get(2, TimeUnit.SECONDS);
            RoomManager.JoinHandle second = manager.join(metadata.id(), UUID.randomUUID(),
                    new UserIdentity(2, "bob"), ignored -> { });
            assertEquals(RoomRuntime.JoinOutcome.JOINED, second.result().get(2, TimeUnit.SECONDS));
            assertEquals(1, manager.activeRoom(metadata.id()).orElseThrow().presenceCount());
        } finally {
            assertTrue(manager.close(Duration.ofSeconds(5)));
        }
    }

    @Test
    @Timeout(8)
    void databaseFailureAfterActivationDoesNotBreakExistingRoomHotPath() throws Exception {
        AtomicInteger loads = new AtomicInteger();
        RoomMetadata metadata = metadata(48, 4, openGrid(2, 2));
        RoomManager manager = manager(id -> {
            if (loads.incrementAndGet() > 1) throw new IllegalStateException("simulated database outage");
            return java.util.Optional.of(metadata);
        }, 1, 10_000);
        try {
            RoomManager.JoinHandle first = manager.join(metadata.id(), UUID.randomUUID(),
                    new UserIdentity(1, "alice"), ignored -> { });
            assertEquals(RoomRuntime.JoinOutcome.JOINED, first.result().get(2, TimeUnit.SECONDS));
            RoomManager.JoinHandle duringOutage = manager.join(metadata.id(), UUID.randomUUID(),
                    new UserIdentity(2, "bob"), ignored -> { });
            assertEquals(RoomRuntime.JoinOutcome.JOINED, duringOutage.result().get(2, TimeUnit.SECONDS));
            assertEquals(1, loads.get(), "an active room reuses RAM metadata without another DB lookup");
        } finally {
            assertTrue(manager.close(Duration.ofSeconds(5)));
        }
    }

    @Test
    @Timeout(8)
    void activeRoomDirectoryRejectsBeyondConfiguredBound() throws Exception {
        RoomManager manager = new RoomManager(id -> java.util.Optional.of(metadata(id.value(), 4, openGrid(2, 2))),
                new RoomConfig(1, 2, 32, 8, 2, 10_000, 8, 4));
        try {
            for (long id = 1; id <= 2; id++) {
                RoomManager.JoinHandle admitted = manager.join(new RoomId(id), UUID.randomUUID(),
                        new UserIdentity(id, "user_" + id), ignored -> { });
                assertEquals(RoomRuntime.JoinOutcome.JOINED, admitted.result().get(2, TimeUnit.SECONDS));
            }
            RoomManager.JoinHandle excess = manager.join(new RoomId(3), UUID.randomUUID(),
                    new UserIdentity(3, "user_3"), ignored -> { });
            assertEquals(RoomRuntime.JoinOutcome.UNAVAILABLE, excess.result().get(2, TimeUnit.SECONDS));
            assertEquals(2, manager.snapshot().activeRooms());
        } finally {
            assertTrue(manager.close(Duration.ofSeconds(5)));
        }
        assertEquals(0, manager.snapshot().activeRooms());
    }

    private static RoomManager manager(RoomLoader loader, int workers, int idleMillis) {
        return new RoomManager(loader, new RoomConfig(workers, 16, 512, 16, 2, idleMillis, 100, 16));
    }

    static RoomMetadata metadata(long id, int capacity, RoomGridDefinition grid) {
        Instant now = Instant.now();
        return new RoomMetadata(new RoomId(id), 1, "Room " + id, "", capacity, grid, now, now);
    }

    static RoomGridDefinition openGrid(int width, int height) {
        byte[] cells = new byte[width * height];
        java.util.Arrays.fill(cells, (byte) 1);
        return new RoomGridDefinition(width, height, cells, 0, 0);
    }
}
