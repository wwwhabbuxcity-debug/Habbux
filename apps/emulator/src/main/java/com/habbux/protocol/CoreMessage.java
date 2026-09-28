package com.habbux.protocol;

import java.util.Arrays;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Wire IDs mirror the canonical registry in packages/protocol/protocol.json. */
public enum CoreMessage {
    CLIENT_HELLO(1), SERVER_HELLO(2), PING(3), PONG(4), CLIENT_DISCONNECT(5), SERVER_ERROR(6);

    private final int id;
    private static final Map<Integer, CoreMessage> BY_ID = Arrays.stream(values())
            .collect(Collectors.toUnmodifiableMap(CoreMessage::id, Function.identity()));

    CoreMessage(int id) { this.id = id; }

    public int id() { return id; }

    public static Optional<CoreMessage> find(int id) {
        return Optional.ofNullable(BY_ID.get(id));
    }

    public static CoreMessage fromId(int id) { return BY_ID.get(id); }
}
