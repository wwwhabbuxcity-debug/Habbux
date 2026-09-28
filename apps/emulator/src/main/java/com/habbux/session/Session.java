package com.habbux.session;

import java.util.UUID;
import com.habbux.room.RoomId;
import com.habbux.room.RoomManager;
import com.habbux.user.UserIdentity;

/** Anonymous transport session; all state transitions are driven on its channel event loop. */
public final class Session {
    public enum State { CONNECTED, HANDSHAKING, READY, AUTHENTICATING, AUTHENTICATED, DISCONNECTED }

    private final UUID id;
    private volatile State state = State.CONNECTED;
    private volatile UserIdentity principal;
    private volatile RoomId roomId;
    private volatile RoomManager.JoinHandle roomJoin;
    private volatile RoomState roomState = RoomState.NONE;

    public enum RoomState { NONE, JOINING, IN_ROOM }
    public record RoomMembership(RoomId roomId, RoomManager.JoinHandle joinHandle, RoomState state) { }

    Session(UUID id) { this.id = id; }

    public UUID id() { return id; }
    public State state() { return state; }
    public UserIdentity principal() { return principal; }
    public RoomId roomId() { return roomId; }
    public RoomState roomState() { return roomState; }

    /** Must be called from the channel EventLoop. */
    public boolean beginRoomJoin(RoomManager.JoinHandle handle) {
        if (state != State.AUTHENTICATED || roomState != RoomState.NONE) return false;
        roomId = handle.roomId();
        roomJoin = handle;
        roomState = RoomState.JOINING;
        return true;
    }

    /** Must be called from the channel EventLoop after the room owner finishes the join event. */
    public boolean completeRoomJoin(RoomManager.JoinHandle handle, boolean joined) {
        if (roomJoin != handle || roomState != RoomState.JOINING) return false;
        roomJoin = null;
        if (joined && state == State.AUTHENTICATED) roomState = RoomState.IN_ROOM;
        else {
            roomId = null;
            roomState = RoomState.NONE;
        }
        return joined && state == State.AUTHENTICATED;
    }

    /** Detaches membership before registry cleanup so pending joins can be cancelled and drained. */
    public RoomMembership detachRoom() {
        RoomMembership membership = new RoomMembership(roomId, roomJoin, roomState);
        if (roomJoin != null) roomJoin.cancel();
        roomId = null;
        roomJoin = null;
        roomState = RoomState.NONE;
        return membership;
    }

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
