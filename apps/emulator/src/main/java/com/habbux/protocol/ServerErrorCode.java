package com.habbux.protocol;

public enum ServerErrorCode {
    INVALID_STATE(1), HANDSHAKE_TIMEOUT(2);

    private final int code;

    ServerErrorCode(int code) { this.code = code; }

    public int code() { return code; }
}
