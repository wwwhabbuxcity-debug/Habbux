package com.habbux.protocol;

import java.util.Arrays;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Wire IDs mirror the canonical registry in packages/protocol/protocol.json. */
public enum CoreMessage {
    CLIENT_HELLO(1), SERVER_HELLO(2), PING(3), PONG(4), CLIENT_DISCONNECT(5), SERVER_ERROR(6),
    AUTH_LOGIN(7), AUTH_REGISTER(8), AUTH_SUCCESS(9), AUTH_FAILURE(10), AUTH_LOGOUT(11),
    AUTH_LOGOUT_SUCCESS(12), ROOM_JOIN(13), ROOM_JOIN_SUCCESS(14), ROOM_JOIN_FAILURE(15),
    ROOM_LEAVE(16), ROOM_LEAVE_SUCCESS(17), ROOM_SNAPSHOT(18), ROOM_MOVE(19),
    ROOM_USER_POSITION(20), ROOM_ACTION_FAILURE(21), ROOM_USER_JOIN(22), ROOM_USER_LEAVE(23),
    ROOM_CHAT(24), ROOM_USER_CHAT(25);

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
