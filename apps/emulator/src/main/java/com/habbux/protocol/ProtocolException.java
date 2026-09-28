package com.habbux.protocol;

public final class ProtocolException extends Exception {
    private static final long serialVersionUID = 1L;

    public enum Category { TRUNCATED, UNSUPPORTED_VERSION, UNKNOWN_MESSAGE, INVALID_FLAGS, INVALID_LENGTH, PAYLOAD_TOO_LARGE }

    private final Category category;

    public ProtocolException(Category category, String message) {
        super(message);
        this.category = category;
    }

    public Category category() { return category; }
}
