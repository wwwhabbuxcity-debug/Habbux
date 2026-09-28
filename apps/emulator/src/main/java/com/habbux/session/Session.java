package com.habbux.session;

import java.util.UUID;
import com.habbux.user.UserIdentity;

/** Anonymous transport session; all state transitions are driven on its channel event loop. */
public final class Session {
    public enum State { CONNECTED, HANDSHAKING, READY, AUTHENTICATING, AUTHENTICATED, DISCONNECTED }

    private final UUID id;
    private volatile State state = State.CONNECTED;
    private volatile UserIdentity principal;

    Session(UUID id) { this.id = id; }

    public UUID id() { return id; }
    public State state() { return state; }
    public UserIdentity principal() { return principal; }

    public boolean authenticate(UserIdentity identity) {
        if (state != State.AUTHENTICATING) return false;
        principal = java.util.Objects.requireNonNull(identity, "identity");
        state = State.AUTHENTICATED;
        return true;
    }

    public boolean transition(State expected, State next) {
        if (state != expected) return false;
        if (next == State.READY || next == State.DISCONNECTED) principal = null;
        state = next;
        return true;
    }
}
