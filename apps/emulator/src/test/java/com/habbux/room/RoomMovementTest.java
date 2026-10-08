package com.habbux.room;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
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

class RoomMovementTest {
    @Test
    @Timeout(8)
    void sameTileRequestStopsWithoutSchedulingMovement() throws Exception {
        RoomMetadata room = metadata(97, 2, 3, 3, filled(9));
        RoomManager manager = manager(id -> java.util.Optional.of(room), room.capacity(), 128, 1_000);
        BlockingQueue<RoomOutbound> output = new LinkedBlockingQueue<>();
        UUID sessionId = UUID.randomUUID();
        try {
            join(manager, room, sessionId, 1, output);
            assertEquals(RoomRuntime.MoveOutcome.ARRIVED,
                    manager.move(room.id(), sessionId, 0, 0, output::add).get(1, TimeUnit.SECONDS));
            assertEquals(0, manager.activeRoom(room.id()).orElseThrow().movingCount());
        } finally {
            assertTrue(manager.close(Duration.ofSeconds(3)));
        }
    }

    @Test
    @Timeout(8)
    void newDestinationReplacesCurrentPathFromAuthoritativePosition() throws Exception {
        RoomMetadata room = metadata(98, 2, 5, 5, filled(25));
        RoomManager manager = manager(id -> java.util.Optional.of(room), room.capacity(), 128, 1_000);
        BlockingQueue<RoomOutbound> output = new LinkedBlockingQueue<>();
        UUID sessionId = UUID.randomUUID();
        try {
            join(manager, room, sessionId, 1, output);
            assertEquals(RoomRuntime.MoveOutcome.MOVING,
                    manager.move(room.id(), sessionId, 0, 4, output::add).get(1, TimeUnit.SECONDS));
            assertEquals(RoomRuntime.MoveOutcome.MOVING,
                    manager.move(room.id(), sessionId, 4, 4, output::add).get(1, TimeUnit.SECONDS));

            int x = 0;
            int y = 0;
            for (int step = 0; step < 4; step++) {
                String[] coordinates = awaitPosition(output).split(",");
                int nextX = Integer.parseInt(coordinates[0]);
                int nextY = Integer.parseInt(coordinates[1]);
                assertEquals(1, Math.max(Math.abs(nextX - x), Math.abs(nextY - y)),
                        "movement stays adjacent");
                x = nextX;
                y = nextY;
            }
            assertEquals("4,4", x + "," + y);
            assertEquals(0, manager.activeRoom(room.id()).orElseThrow().movingCount());
        } finally {
            assertTrue(manager.close(Duration.ofSeconds(3)));
        }
    }

    @Test
    @Timeout(10)
    void movementUsesOneFiveHundredMillisecondStepWithoutBurstingTiles() throws Exception {
        RoomMetadata room = metadata(90, 2, 11, 1, filled(11));
        RoomManager manager = manager(id -> java.util.Optional.of(room), room.capacity(), 128, 100);
        BlockingQueue<RoomOutbound> output = new LinkedBlockingQueue<>();
        UUID sessionId = UUID.randomUUID();
        try {
            join(manager, room, sessionId, 1, output);
            long started = System.nanoTime();
            assertEquals(RoomRuntime.MoveOutcome.MOVING,
                    manager.move(room.id(), sessionId, 10, 0, output::add).get(1, TimeUnit.SECONDS));
            long fiveTileNanos = 0;
            for (int step = 1; step <= 10; step++) {
                String[] coordinates = awaitPosition(output).split(",");
                assertEquals(step, Integer.parseInt(coordinates[0]));
                if (step == 5) fiveTileNanos = System.nanoTime() - started;
            }
            long tenTileNanos = System.nanoTime() - started;
            assertTrue(fiveTileNanos >= TimeUnit.MILLISECONDS.toNanos(2_000)
                            && fiveTileNanos < TimeUnit.MILLISECONDS.toNanos(3_500),
                    "five tiles should take about 2.5 seconds");
            assertTrue(tenTileNanos >= TimeUnit.MILLISECONDS.toNanos(4_500)
                            && tenTileNanos < TimeUnit.MILLISECONDS.toNanos(7_000),
                    "ten tiles should take about 5 seconds");
        } finally {
            assertTrue(manager.close(Duration.ofSeconds(3)));
        }
    }

    @Test
    @Timeout(8)
    void leavingWhileMovingRemovesPresenceAndPendingPath() throws Exception {
        RoomMetadata room = metadata(99, 2, 5, 5, filled(25));
        RoomManager manager = manager(id -> java.util.Optional.of(room), room.capacity(), 128, 1_000);
        BlockingQueue<RoomOutbound> output = new LinkedBlockingQueue<>();
        UUID sessionId = UUID.randomUUID();
        try {
            join(manager, room, sessionId, 1, output);
            assertEquals(RoomRuntime.MoveOutcome.MOVING,
                    manager.move(room.id(), sessionId, 4, 4, output::add).get(1, TimeUnit.SECONDS));
            manager.leave(room.id(), sessionId, output::add, false).get(1, TimeUnit.SECONDS);
            assertEquals(0, manager.activeRoom(room.id()).orElseThrow().presenceCount());
            assertEquals(0, manager.activeRoom(room.id()).orElseThrow().movingCount());
            manager.tickMovingRooms();
            assertNull(output.poll(100, TimeUnit.MILLISECONDS));
        } finally {
            assertTrue(manager.close(Duration.ofSeconds(3)));
        }
    }

    @Test
    @Timeout(8)
    void eightDirectionSearchUsesSafeDiagonalsAndEmitsOneAuthoritativeTilePerTick() throws Exception {
        byte[] cells = {1, 0, 1, 1, 1, 1};
        RoomMetadata room = metadata(91, 2, 3, 2, cells);
        RoomManager manager = manager(id -> java.util.Optional.of(room), room.capacity(), 128, 100);
        BlockingQueue<RoomOutbound> output = new LinkedBlockingQueue<>();
        UUID sessionId = UUID.randomUUID();
        try {
            join(manager, room, sessionId, 1, output);
            assertEquals(RoomRuntime.MoveOutcome.MOVING,
                    manager.move(room.id(), sessionId, 2, 0, output::add).get(1, TimeUnit.SECONDS));
            List<String> positions = List.of(awaitPosition(output), awaitPosition(output));
            assertEquals(List.of("1,1", "2,0"), positions);
            assertEquals(0, manager.activeRoom(room.id()).orElseThrow().movingCount());
        } finally {
            assertTrue(manager.close(Duration.ofSeconds(3)));
        }
    }

    @Test
    @Timeout(8)
    void occupiedDestinationIsRejectedAndTwoPathsCannotCollideOnATile() throws Exception {
        RoomMetadata room = metadata(92, 5, 5, 1, filled(5));
        RoomManager manager = manager(id -> java.util.Optional.of(room), room.capacity(), 128, 100);
        BlockingQueue<RoomOutbound> aliceOutput = new LinkedBlockingQueue<>();
        BlockingQueue<RoomOutbound> bobOutput = new LinkedBlockingQueue<>();
        UUID alice = UUID.randomUUID();
        UUID bob = UUID.randomUUID();
        try {
            join(manager, room, alice, 1, aliceOutput);
            join(manager, room, bob, 2, bobOutput);
            assertEquals(RoomRuntime.MoveOutcome.INVALID_DESTINATION,
                    manager.move(room.id(), alice, 1, 0, aliceOutput::add).get(1, TimeUnit.SECONDS));
            assertEquals(RoomRuntime.MoveOutcome.MOVING,
                    manager.move(room.id(), bob, 4, 0, bobOutput::add).get(1, TimeUnit.SECONDS));
            awaitPositionAt(bobOutput, 4, 0);

            assertEquals(RoomRuntime.MoveOutcome.MOVING,
                    manager.move(room.id(), alice, 2, 0, aliceOutput::add).get(1, TimeUnit.SECONDS));
            RoomRuntime.MoveOutcome bobMove = manager.move(room.id(), bob, 2, 0, bobOutput::add)
                    .get(1, TimeUnit.SECONDS);
            assertTrue(bobMove == RoomRuntime.MoveOutcome.MOVING
                            || bobMove == RoomRuntime.MoveOutcome.INVALID_DESTINATION,
                    "the destination is either accepted before Alice reaches it or rejected after occupancy changes");
            if (bobMove == RoomRuntime.MoveOutcome.MOVING) {
                RoomOutbound.ActionFailed failure = awaitActionFailure(bobOutput);
                assertEquals(RoomOutbound.ActionFailure.INVALID_DESTINATION, failure.reason());
            }
            awaitPositionAt(aliceOutput, 2, 0);
            assertEquals(2, manager.activeRoom(room.id()).orElseThrow().presenceCount());
        } finally {
            assertTrue(manager.close(Duration.ofSeconds(3)));
        }
    }

    @Test
    @Timeout(8)
    void disconnectedTilesAndConfiguredPathLengthFailWithoutMovingPresence() throws Exception {
        RoomMetadata room = metadata(93, 1, 3, 1, new byte[] {1, 0, 1});
        RoomManager manager = manager(id -> java.util.Optional.of(room), room.capacity(), 128, 100);
        BlockingQueue<RoomOutbound> output = new LinkedBlockingQueue<>();
        UUID sessionId = UUID.randomUUID();
        try {
            join(manager, room, sessionId, 1, output);
            assertEquals(RoomRuntime.MoveOutcome.UNREACHABLE,
                    manager.move(room.id(), sessionId, 2, 0, output::add).get(1, TimeUnit.SECONDS));
            RoomOutbound.ActionFailed failure = awaitActionFailure(output);
            assertEquals(RoomOutbound.ActionFailure.UNREACHABLE, failure.reason());
            assertEquals(RoomRuntime.MoveOutcome.INVALID_DESTINATION,
                    manager.move(room.id(), sessionId, 3, 0, output::add).get(1, TimeUnit.SECONDS));
            assertEquals(RoomOutbound.ActionFailure.INVALID_DESTINATION, awaitActionFailure(output).reason());
        } finally {
            assertTrue(manager.close(Duration.ofSeconds(3)));
        }
    }

    @Test
    @Timeout(8)
    void pathLengthLimitIsEnforcedAndCodecTreatsCoordinatesAsUnsigned() throws Exception {
        RoomMetadata room = metadata(94, 5, 5, 1, filled(5));
        RoomManager manager = manager(id -> java.util.Optional.of(room), room.capacity(), 2, 100);
        BlockingQueue<RoomOutbound> output = new LinkedBlockingQueue<>();
        UUID sessionId = UUID.randomUUID();
        try {
            join(manager, room, sessionId, 1, output);
            assertEquals(RoomRuntime.MoveOutcome.PATH_LIMIT,
                    manager.move(room.id(), sessionId, 4, 0, output::add).get(1, TimeUnit.SECONDS));
            assertEquals(RoomOutbound.ActionFailure.PATH_LIMIT, awaitActionFailure(output).reason());
            RoomPayloadCodec.Destination decoded = RoomPayloadCodec.decodeMove(new byte[] {(byte) 255, 2});
            assertEquals(255, decoded.x());
            assertEquals(2, decoded.y());
        } finally {
            assertTrue(manager.close(Duration.ofSeconds(3)));
        }
    }

    @Test
    @Timeout(8)
    void exploredNodeLimitStopsSearchBeforeAnExpensiveFarDestination() throws Exception {
        RoomMetadata room = metadata(96, 5, 5, 1, filled(5));
        RoomManager manager = new RoomManager(id -> java.util.Optional.of(room),
                new RoomConfig(1, 8, 64, 16, 2, 10_000, 5, 8, 1, 128, 100));
        BlockingQueue<RoomOutbound> output = new LinkedBlockingQueue<>();
        UUID sessionId = UUID.randomUUID();
        try {
            join(manager, room, sessionId, 1, output);
            assertEquals(RoomRuntime.MoveOutcome.PATH_LIMIT,
                    manager.move(room.id(), sessionId, 4, 0, output::add).get(1, TimeUnit.SECONDS));
            assertEquals(RoomOutbound.ActionFailure.PATH_LIMIT, awaitActionFailure(output).reason());
        } finally {
            assertTrue(manager.close(Duration.ofSeconds(3)));
        }
    }

    private static RoomManager manager(RoomLoader loader, int capacity, int maxPathLength, int tickMillis) {
        return new RoomManager(loader, new RoomConfig(1, 8, 64, 16, 2, 10_000,
                capacity, 8, 4_096, maxPathLength, tickMillis));
    }

    private static void join(RoomManager manager, RoomMetadata room, UUID sessionId, long userId,
                             BlockingQueue<RoomOutbound> output) throws Exception {
        RoomManager.JoinHandle handle = manager.join(room.id(), sessionId,
                new UserIdentity(userId, "user_" + userId), output::add);
        assertEquals(RoomRuntime.JoinOutcome.JOINED, handle.result().get(2, TimeUnit.SECONDS));
        assertNotNull(output.poll(1, TimeUnit.SECONDS));
        assertNotNull(output.poll(1, TimeUnit.SECONDS));
    }

    private static String awaitPosition(BlockingQueue<RoomOutbound> output) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        while (System.nanoTime() < deadline) {
            RoomOutbound message = output.poll(50, TimeUnit.MILLISECONDS);
            if (message instanceof RoomOutbound.Position position) return position.x() + "," + position.y();
        }
        throw new AssertionError("timed out waiting for a position step");
    }

    private static void awaitPositionAt(BlockingQueue<RoomOutbound> output, int x, int y) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        while (System.nanoTime() < deadline) {
            RoomOutbound message = output.poll(50, TimeUnit.MILLISECONDS);
            if (message instanceof RoomOutbound.Position position && position.x() == x && position.y() == y) return;
        }
        throw new AssertionError("timed out waiting for destination position " + x + "," + y);
    }

    private static RoomOutbound.ActionFailed awaitActionFailure(BlockingQueue<RoomOutbound> output) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
        while (System.nanoTime() < deadline) {
            RoomOutbound message = output.poll(50, TimeUnit.MILLISECONDS);
            if (message instanceof RoomOutbound.ActionFailed failure) return failure;
        }
        throw new AssertionError("timed out waiting for a movement rejection");
    }

    private static RoomMetadata metadata(long id, int capacity, int width, int height, byte[] cells) {
        Instant now = Instant.now();
        return new RoomMetadata(new RoomId(id), 1, "Movement " + id, "", capacity,
                new RoomGridDefinition(width, height, cells, 0, 0), now, now);
    }

    private static byte[] filled(int length) {
        byte[] cells = new byte[length];
        Arrays.fill(cells, (byte) 1);
        return cells;
    }
}
