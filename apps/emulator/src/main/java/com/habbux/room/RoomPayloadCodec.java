package com.habbux.room;

import com.habbux.protocol.CoreMessage;
import com.habbux.protocol.FrameCodec;
import com.habbux.protocol.HabbuxFrame;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Bounded room payload codecs for Core Protocol v1. All integers are big-endian. */
public final class RoomPayloadCodec {
    /** 4096 walkability bytes plus 100 occupants with 20-byte usernames and framing fields. */
    public static final int MAX_SNAPSHOT_PAYLOAD_BYTES = 7_308;
    private static final int MAX_PAYLOAD_BYTES = 65_536;

    private RoomPayloadCodec() { }

    public static RoomId decodeJoin(byte[] payload) {
        if (payload.length != Long.BYTES) throw new MalformedRoomPayloadException("room join must contain one uint64");
        long value = ByteBuffer.wrap(payload).order(ByteOrder.BIG_ENDIAN).getLong();
        try { return new RoomId(value); }
        catch (IllegalArgumentException invalid) { throw new MalformedRoomPayloadException("room id must be positive"); }
    }

    public static void validateLeave(byte[] payload) {
        if (payload.length != 0) throw new MalformedRoomPayloadException("room leave payload must be empty");
    }

    public static HabbuxFrame encode(RoomOutbound message) {
        if (message instanceof RoomOutbound.Joined joined) {
            return frame(CoreMessage.ROOM_JOIN_SUCCESS, ByteBuffer.allocate(10).putLong(joined.roomId().value())
                    .put((byte) joined.x()).put((byte) joined.y()).array());
        }
        if (message instanceof RoomOutbound.JoinFailed failed) {
            int category = switch (failed.reason()) {
                case NOT_FOUND -> 1;
                case FULL -> 2;
                case ALREADY_IN_ROOM -> 3;
                case UNAVAILABLE -> 4;
            };
            return frame(CoreMessage.ROOM_JOIN_FAILURE, new byte[] {(byte) category});
        }
        if (message instanceof RoomOutbound.Left) return frame(CoreMessage.ROOM_LEAVE_SUCCESS, new byte[0]);
        if (message instanceof RoomOutbound.Snapshot snapshot) return encodeSnapshot(snapshot.snapshot());
        throw new IllegalArgumentException("unsupported room outbound message");
    }

    private static HabbuxFrame encodeSnapshot(RoomSnapshot snapshot) {
        byte[] walkability = snapshot.walkability();
        List<byte[]> usernames = new ArrayList<>(snapshot.occupants().size());
        long length = 8 + 3L + walkability.length + 1;
        for (RoomSnapshot.Occupant occupant : snapshot.occupants()) {
            byte[] username = encodeText(occupant.username(), 3, 20, "username");
            usernames.add(username);
            length += 8 + 2 + 2L + username.length;
        }
        if (snapshot.width() < 1 || snapshot.width() > 64 || snapshot.height() < 1 || snapshot.height() > 64
                || walkability.length != snapshot.width() * snapshot.height()
                || snapshot.capacity() < 1 || snapshot.capacity() > RoomMetadata.MAX_CAPACITY
                || snapshot.occupants().size() > snapshot.capacity() || snapshot.occupants().size() > 255
                || length > MAX_SNAPSHOT_PAYLOAD_BYTES || length > MAX_PAYLOAD_BYTES) {
            throw new MalformedRoomPayloadException("room snapshot exceeds Core v1 bounds");
        }
        ByteBuffer payload = allocate(length);
        payload.putLong(snapshot.roomId().value()).put((byte) snapshot.width()).put((byte) snapshot.height())
                .put((byte) snapshot.capacity()).put(walkability).put((byte) snapshot.occupants().size());
        for (int index = 0; index < snapshot.occupants().size(); index++) {
            RoomSnapshot.Occupant occupant = snapshot.occupants().get(index);
            payload.putLong(occupant.userId()).put((byte) occupant.x()).put((byte) occupant.y());
            putShortText(payload, usernames.get(index));
        }
        return frame(CoreMessage.ROOM_SNAPSHOT, payload.array());
    }

    private static ByteBuffer allocate(long length) {
        if (length < 0 || length > MAX_PAYLOAD_BYTES) throw new MalformedRoomPayloadException("room payload exceeds Core v1 limit");
        return ByteBuffer.allocate((int) length).order(ByteOrder.BIG_ENDIAN);
    }

    private static void putShortText(ByteBuffer payload, byte[] text) {
        payload.putShort((short) text.length).put(text);
    }

    private static byte[] encodeText(String value, int minBytes, int maxBytes, String name) {
        byte[] encoded = value.getBytes(StandardCharsets.UTF_8);
        if (encoded.length < minBytes || encoded.length > maxBytes) {
            throw new MalformedRoomPayloadException(name + " is outside the supported byte limit");
        }
        return encoded;
    }

    private static HabbuxFrame frame(CoreMessage message, byte[] payload) {
        if (payload.length > MAX_PAYLOAD_BYTES) throw new MalformedRoomPayloadException("room payload exceeds Core v1 limit");
        return new HabbuxFrame(FrameCodec.VERSION, message.id(), 0, payload);
    }

    public static final class MalformedRoomPayloadException extends IllegalArgumentException {
        private static final long serialVersionUID = 1L;
        public MalformedRoomPayloadException(String message) { super(message); }
    }
}
