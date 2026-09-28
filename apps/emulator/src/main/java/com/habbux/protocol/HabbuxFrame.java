package com.habbux.protocol;

import java.util.Arrays;

/** Immutable wire frame. Public boundaries defensively copy the payload. */
public final class HabbuxFrame {
    private final int version;
    private final int messageId;
    private final int flags;
    private final byte[] payload;

    public HabbuxFrame(int version, int messageId, int flags, byte[] payload) {
        this(version, messageId, flags, payload, false);
    }

    private HabbuxFrame(int version, int messageId, int flags, byte[] payload, boolean owned) {
        if (version < 0 || version > 255) throw new IllegalArgumentException("version must fit uint8");
        if (messageId < 0 || messageId > 65_535) throw new IllegalArgumentException("messageId must fit uint16");
        if (flags < 0 || flags > 255) throw new IllegalArgumentException("flags must fit uint8");
        this.version = version;
        this.messageId = messageId;
        this.flags = flags;
        this.payload = owned ? payload : Arrays.copyOf(payload, payload.length);
    }

    static HabbuxFrame fromOwnedPayload(int version, int messageId, int flags, byte[] payload) {
        return new HabbuxFrame(version, messageId, flags, payload, true);
    }

    public int version() { return version; }
    public int messageId() { return messageId; }
    public int flags() { return flags; }
    public byte[] payload() { return Arrays.copyOf(payload, payload.length); }
    byte[] payloadForCodec() { return payload; }
}
