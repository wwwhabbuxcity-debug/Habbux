package com.habbux.auth;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class IdentityFailureLimiterTest {
    @Test
    void brieflyBlocksAfterRepeatedFailuresAndClearsOnSuccess() {
        IdentityFailureLimiter limiter = new IdentityFailureLimiter();
        long now = 5_000_000_000L;
        for (int attempt = 0; attempt < 4; attempt++) limiter.failed("alice", now + attempt);
        assertFalse(limiter.isBlocked("alice", now + Duration.ofSeconds(1).toNanos()));
        limiter.failed("alice", now + Duration.ofSeconds(2).toNanos());
        assertTrue(limiter.isBlocked("alice", now + Duration.ofSeconds(3).toNanos()));
        assertFalse(limiter.isBlocked("alice", now + Duration.ofSeconds(63).toNanos()));
        for (int attempt = 0; attempt < 4; attempt++) limiter.failed("alice", now + Duration.ofSeconds(64).toNanos() + attempt);
        limiter.succeeded("alice");
        assertFalse(limiter.isBlocked("alice", now + Duration.ofSeconds(65).toNanos()));
    }

    @Test
    void expiresFailureWindowAndKeepsIdentitiesIndependent() {
        IdentityFailureLimiter limiter = new IdentityFailureLimiter();
        long now = 1_000_000L;
        for (int attempt = 0; attempt < 5; attempt++) limiter.failed("alice", now + attempt);
        assertTrue(limiter.isBlocked("alice", now + 6));
        assertFalse(limiter.isBlocked("bob", now + 6));
        assertFalse(limiter.isBlocked("alice", now + Duration.ofMinutes(16).toNanos()));
    }
}
