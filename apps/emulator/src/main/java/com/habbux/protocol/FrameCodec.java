package com.habbux.protocol;

import io.netty.buffer.ByteBuf;
import io.netty.buffer.ByteBufAllocator;

/** Bounded, big-endian v1 codec. One invocation decodes exactly one frame. */
public final class FrameCodec {
    public static final int VERSION = 1;
    public static final int HEADER_BYTES = 8;
    public static final int DEFAULT_MAX_PAYLOAD_BYTES = 65_536;

    public ByteBuf encode(ByteBufAllocator allocator, HabbuxFrame frame, int maxPayloadBytes) {
        byte[] payload = frame.payloadForCodec();
        validateForEncode(frame, payload.length, maxPayloadBytes);
        ByteBuf output = allocator.buffer(HEADER_BYTES + payload.length, HEADER_BYTES + payload.length);
        output.writeByte(frame.version());
        output.writeShort(frame.messageId());
        output.writeByte(frame.flags());
        output.writeInt(payload.length);
        output.writeBytes(payload);
        return output;
    }

    public HabbuxFrame decode(ByteBuf input, int maxPayloadBytes) throws ProtocolException {
        if (maxPayloadBytes < 0 || maxPayloadBytes > DEFAULT_MAX_PAYLOAD_BYTES) {
            throw new IllegalArgumentException("Configured payload limit must be between 0 and 65536 bytes");
        }
        int readable = input.readableBytes();
        if (readable < HEADER_BYTES) {
            throw new ProtocolException(ProtocolException.Category.TRUNCATED, "Frame header is truncated");
        }
        int start = input.readerIndex();
        int version = input.getUnsignedByte(start);
        int messageId = input.getUnsignedShort(start + 1);
        int flags = input.getUnsignedByte(start + 3);
        long length = input.getUnsignedInt(start + 4);
        if (version != VERSION) {
            throw new ProtocolException(ProtocolException.Category.UNSUPPORTED_VERSION, "Unsupported protocol version");
        }
        if (CoreMessage.fromId(messageId) == null) {
            throw new ProtocolException(ProtocolException.Category.UNKNOWN_MESSAGE, "Unknown message ID");
        }
        if (flags != 0) {
            throw new ProtocolException(ProtocolException.Category.INVALID_FLAGS, "Reserved flags must be zero");
        }
        if (length > maxPayloadBytes) {
            throw new ProtocolException(ProtocolException.Category.PAYLOAD_TOO_LARGE, "Payload exceeds configured limit");
        }
        if (length != readable - HEADER_BYTES) {
            ProtocolException.Category category = length > readable - HEADER_BYTES
                    ? ProtocolException.Category.TRUNCATED : ProtocolException.Category.INVALID_LENGTH;
            throw new ProtocolException(category, "Frame length does not match WebSocket message");
        }
        int payloadLength = (int) length;
        byte[] payload = new byte[payloadLength];
        input.getBytes(start + HEADER_BYTES, payload);
        input.skipBytes(readable);
        return HabbuxFrame.fromOwnedPayload(version, messageId, flags, payload);
    }

    private static void validateForEncode(HabbuxFrame frame, int payloadLength, int maxPayloadBytes) {
        if (frame.version() != VERSION) throw new IllegalArgumentException("Unsupported protocol version");
        if (CoreMessage.fromId(frame.messageId()) == null) throw new IllegalArgumentException("Unknown message ID");
        if (frame.flags() != 0) throw new IllegalArgumentException("Reserved flags must be zero");
        if (maxPayloadBytes < 0 || maxPayloadBytes > DEFAULT_MAX_PAYLOAD_BYTES || payloadLength > maxPayloadBytes) {
            throw new IllegalArgumentException("Payload exceeds configured limit");
        }
    }
}
