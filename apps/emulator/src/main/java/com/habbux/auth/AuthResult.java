package com.habbux.auth;

import com.habbux.user.UserIdentity;

/** Small safe result passed from an Auth worker back to the channel event loop. */
public record AuthResult(UserIdentity user, AuthFailure failure) {
    public AuthResult {
        if ((user == null) == (failure == null)) throw new IllegalArgumentException("exactly one auth outcome is required");
    }
    public static AuthResult success(UserIdentity user) { return new AuthResult(user, null); }
    public static AuthResult failure(AuthFailure failure) { return new AuthResult(null, failure); }
    public boolean succeeded() { return user != null; }
}
