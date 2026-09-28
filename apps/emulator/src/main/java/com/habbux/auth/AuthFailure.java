package com.habbux.auth;

/** Public failure categories deliberately avoid account-existence details. */
public enum AuthFailure {
    INVALID_REQUEST(1), REJECTED(2), RATE_LIMITED(3), UNAVAILABLE(4);

    private final int code;
    AuthFailure(int code) { this.code = code; }
    public int code() { return code; }
}
