package com.habbux.room;

import com.habbux.protocol.CoreMessage;
import com.habbux.protocol.FrameCodec;
import com.habbux.protocol.HabbuxFrame;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/** Bounded room payload codecs for Core Protocol v1. All integers are big-endian. */
public final class RoomPayloadCodec {
    /** 128-byte room name, 4096 walkability bytes and 100 bounded occupants. */
    public static final int MAX_SNAPSHOT_PAYLOAD_BYTES = 7_438;
    public static final int MAX_CHAT_BYTES = 256;
    public static final int MAX_CHAT_CODE_POINTS = 128;
    private static final int MAX_PAYLOAD_BYTES = 65_536;

    private RoomPayloadCodec() { }

    public record Destination(int x, int y) { }

    public static String decodeChat(byte[] payload) {
        if (payload.length < 3 || payload.length > MAX_CHAT_BYTES + Short.BYTES) {
            throw new MalformedRoomPayloadException("room chat payload is outside the supported size");
        }
        ByteBuffer input = ByteBuffer.wrap(payload).order(ByteOrder.BIG_ENDIAN);
        int byteLength = Short.toUnsignedInt(input.getShort());
        if (byteLength < 1 || byteLength > MAX_CHAT_BYTES || byteLength != input.remaining()) {
            throw new MalformedRoomPayloadException("room chat text length is invalid");
        }
        byte[] encoded = new byte[byteLength];
        input.get(encoded);
        String text;
        try {
            text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(encoded)).toString();
        } catch (CharacterCodingException malformed) {
            throw new MalformedRoomPayloadException("room chat must be valid UTF-8");
        }
        validateChatText(text, MAX_CHAT_BYTES, MAX_CHAT_CODE_POINTS);
        return text;
    }

    public static void validateChatText(String text, int maxBytes, int maxCodePoints) {
        if (text == null || text.isBlank()) throw new MalformedRoomPayloadException("room chat text is empty");
        int codePoints = 0;
        for (int index = 0; index < text.length();) {
            char current = text.charAt(index);
            if (Character.isHighSurrogate(current)) {
                if (index + 1 >= text.length() || !Character.isLowSurrogate(text.charAt(index + 1))) {
                    throw new MalformedRoomPayloadException("room chat contains invalid Unicode");
                }
            } else if (Character.isLowSurrogate(current)) {
                throw new MalformedRoomPayloadException("room chat contains invalid Unicode");
            }
            int codePoint = text.codePointAt(index);
            if (Character.isISOControl(codePoint)) {
                throw new MalformedRoomPayloadException("room chat contains a control character");
            }
            codePoints++;
            index += Character.charCount(codePoint);
        }
        int bytes = text.getBytes(StandardCharsets.UTF_8).length;
        if (bytes > maxBytes || codePoints > maxCodePoints) {
            throw new MalformedRoomPayloadException("room chat text exceeds the configured limit");
        }
    }

    public static RoomId decodeJoin(byte[] payload) {
        if (payload.length != Long.BYTES) throw new MalformedRoomPayloadException("room join must contain one uint64");
        long value = ByteBuffer.wrap(payload).order(ByteOrder.BIG_ENDIAN).getLong();
        try { return new RoomId(value); }
        catch (IllegalArgumentException invalid) { throw new MalformedRoomPayloadException("room id must be positive"); }
    }

    public static void validateLeave(byte[] payload) {
        if (payload.length != 0) throw new MalformedRoomPayloadException("room leave payload must be empty");
    }

    public static Destination decodeMove(byte[] payload) {
        if (payload.length != 2) throw new MalformedRoomPayloadException("room move must contain uint8 x and y");
        return new Destination(Byte.toUnsignedInt(payload[0]), Byte.toUnsignedInt(payload[1]));
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
        if (message instanceof RoomOutbound.Position position) {
            return frame(CoreMessage.ROOM_USER_POSITION, ByteBuffer.allocate(11).putLong(position.userId())
                    .put((byte) position.x()).put((byte) position.y()).put((byte) position.z()).array());
        }
        if (message instanceof RoomOutbound.UserJoined joined) {
            byte[] username = encodeText(joined.username(), 3, 20, "username");
            return frame(CoreMessage.ROOM_USER_JOIN, allocate(12L + username.length)
                    .putLong(joined.userId()).put((byte) joined.x()).put((byte) joined.y())
                    .putShort((short) username.length).put(username).array());
        }
        if (message instanceof RoomOutbound.UserLeft left) {
            return frame(CoreMessage.ROOM_USER_LEAVE, ByteBuffer.allocate(Long.BYTES).putLong(left.userId()).array());
        }
        if (message instanceof RoomOutbound.ChatMessage chat) {
            byte[] text = encodeText(chat.text(), 1, MAX_CHAT_BYTES, "chat");
            validateChatText(chat.text(), MAX_CHAT_BYTES, MAX_CHAT_CODE_POINTS);
            return frame(CoreMessage.ROOM_USER_CHAT, allocate(10L + text.length)
                    .putLong(chat.userId()).putShort((short) text.length).put(text).array());
        }
        if (message instanceof RoomOutbound.ActionFailed failed) {
            int operation = failed.operation() == RoomOutbound.ActionOperation.MOVE ? 1 : 2;
            int category = switch (failed.operation()) {
                case MOVE -> switch (failed.reason()) {
                    case NOT_IN_ROOM -> 1;
                    case INVALID_DESTINATION -> 2;
                    case UNREACHABLE -> 3;
                    case PATH_LIMIT -> 4;
                    case UNAVAILABLE -> 5;
                    case INVALID_MESSAGE, RATE_LIMITED -> throw new IllegalArgumentException("chat failure used for movement");
                };
                case CHAT -> switch (failed.reason()) {
                    case NOT_IN_ROOM -> 1;
                    case INVALID_MESSAGE -> 2;
                    case RATE_LIMITED -> 3;
                    case UNAVAILABLE -> 4;
                    case INVALID_DESTINATION, UNREACHABLE, PATH_LIMIT -> throw new IllegalArgumentException("movement failure used for chat");
                };
            };
            return frame(CoreMessage.ROOM_ACTION_FAILURE, new byte[] {(byte) operation, (byte) category});
        }
        throw new IllegalArgumentException("unsupported room outbound message");
    }

    private static HabbuxFrame encodeSnapshot(RoomSnapshot snapshot) {
        byte[] roomName = encodeText(snapshot.name(), 1, RoomMetadata.MAX_NAME_UTF8_BYTES, "room name");
        byte[] walkability = snapshot.walkability();
        List<byte[]> usernames = new ArrayList<>(snapshot.occupants().size());
        long length = 8 + 2L + roomName.length + 3L + walkability.length + 1;
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
        payload.putLong(snapshot.roomId().value()).putShort((short) roomName.length).put(roomName)
                .put((byte) snapshot.width()).put((byte) snapshot.height())
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
