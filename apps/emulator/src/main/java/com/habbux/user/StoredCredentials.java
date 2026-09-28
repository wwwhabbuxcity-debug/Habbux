package com.habbux.user;

import java.util.Objects;

/** Internal authentication lookup result. Never log or expose the password hash. */
public final class StoredCredentials {
    private final UserIdentity identity;
    private final AccountStatus status;
    private final String passwordHash;

    public StoredCredentials(UserIdentity identity, AccountStatus status, String passwordHash) {
        this.identity = Objects.requireNonNull(identity, "identity");
        this.status = Objects.requireNonNull(status, "status");
        this.passwordHash = Objects.requireNonNull(passwordHash, "passwordHash");
    }

    public UserIdentity identity() { return identity; }
    public AccountStatus status() { return status; }
    public String passwordHash() { return passwordHash; }

    @Override
    public String toString() {
        return "StoredCredentials[identity=" + identity + ", status=" + status + ", passwordHash=<redacted>]";
    }
}
