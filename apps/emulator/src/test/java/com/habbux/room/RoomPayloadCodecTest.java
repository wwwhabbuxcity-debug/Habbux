package com.habbux.room;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

class RoomPayloadCodecTest {
    @Test
    void decodesPositiveBigEndianRoomIdsAndRejectsMalformedJoinAndLeave() {
        assertEquals(new RoomId(42), RoomPayloadCodec.decodeJoin(hex("000000000000002a")));
        assertThrows(RoomPayloadCodec.MalformedRoomPayloadException.class, () -> RoomPayloadCodec.decodeJoin(new byte[7]));
        assertThrows(RoomPayloadCodec.MalformedRoomPayloadException.class,
                () -> RoomPayloadCodec.decodeJoin(hex("0000000000000000")));
        assertThrows(RoomPayloadCodec.MalformedRoomPayloadException.class,
                () -> RoomPayloadCodec.validateLeave(new byte[] { 0 }));
        RoomPayloadCodec.validateLeave(new byte[0]);
    }

    @Test
    void decodesUnsignedMovementCoordinatesAndEncodesPositionAndActionFailures() {
        assertEquals(new RoomPayloadCodec.Destination(3, 4), RoomPayloadCodec.decodeMove(new byte[] {3, 4}));
        assertEquals(new RoomPayloadCodec.Destination(255, 2),
                RoomPayloadCodec.decodeMove(new byte[] {(byte) 255, 2}));
        assertThrows(RoomPayloadCodec.MalformedRoomPayloadException.class,
                () -> RoomPayloadCodec.decodeMove(new byte[] {1}));

        var position = RoomPayloadCodec.encode(new RoomOutbound.Position(42, 3, 4, 0));
        assertEquals(20, position.messageId());
        assertArrayEquals(hex("000000000000002a030400"), position.payload());
        var failure = RoomPayloadCodec.encode(new RoomOutbound.ActionFailed(RoomOutbound.ActionFailure.PATH_LIMIT));
        assertEquals(21, failure.messageId());
        assertArrayEquals(hex("0104"), failure.payload());
        var unavailable = RoomPayloadCodec.encode(new RoomOutbound.ActionFailed(RoomOutbound.ActionFailure.UNAVAILABLE));
        assertArrayEquals(hex("0105"), unavailable.payload());
    }

    @Test
    void encodesSnapshotWithinLimitAndContainsOnlyStaticGridAndBoundedOccupants() {
        byte[] walkability = {1, 1, 1, 1};
        RoomSnapshot snapshot = new RoomSnapshot(new RoomId(42), 2, 2, 3, walkability,
                List.of(new RoomSnapshot.Occupant(42, "alice", 0, 0)));
        var frame = RoomPayloadCodec.encode(new RoomOutbound.Snapshot(snapshot));
        assertEquals(18, frame.messageId());
        assertArrayEquals(hex("000000000000002a0202030101010101000000000000002a00000005616c696365"), frame.payload());
        walkability[0] = 0;
        assertEquals(1, snapshot.walkability()[0]);
        assertTrue(frame.payload().length < 65_536);
    }

    private static byte[] hex(String text) {
        byte[] bytes = new byte[text.length() / 2];
        for (int i = 0; i < bytes.length; i++) bytes[i] = (byte) Integer.parseInt(text.substring(i * 2, i * 2 + 2), 16);
        return bytes;
    }
}
