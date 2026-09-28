package com.habbux.user;

import java.util.Objects;

/** Minimal public identity associated with an authenticated session. */
public record UserIdentity(long id, String username) {
    public UserIdentity {
        if (id <= 0) throw new IllegalArgumentException("id must be positive");
        Objects.requireNonNull(username, "username");
    }
}
