package com.habbux.session;

import java.util.UUID;

/** Anonymous transport session; all state transitions are driven on its channel event loop. */
public final class Session {
    public enum State { CONNECTED, HANDSHAKING, READY, DISCONNECTED }

    private final UUID id;
    private volatile State state = State.CONNECTED;

    Session(UUID id) { this.id = id; }

    public UUID id() { return id; }
    public State state() { return state; }

    public boolean transition(State expected, State next) {
        if (state != expected) return false;
        state = next;
        return true;
    }
}
