package com.habbux.auth;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Objects;

/** Bounded per-process identity failure window, striped to avoid one global lock. */
final class IdentityFailureLimiter {
    private static final int STRIPE_COUNT = 64;
    private static final int ENTRIES_PER_STRIPE = 64;
    private static final int FAILURE_LIMIT = 5;
    private static final long WINDOW_NANOS = Duration.ofMinutes(15).toNanos();
    private static final long BLOCK_NANOS = Duration.ofSeconds(60).toNanos();
    private final Stripe[] stripes = new Stripe[STRIPE_COUNT];

    IdentityFailureLimiter() {
        for (int index = 0; index < stripes.length; index++) stripes[index] = new Stripe();
    }

    boolean isBlocked(String normalizedIdentity, long nowNanos) {
        Stripe stripe = stripe(normalizedIdentity);
        synchronized (stripe) {
            Entry entry = stripe.entries.get(normalizedIdentity);
            if (entry == null) return false;
            if (entry.blockedUntil != 0 && elapsed(nowNanos, entry.blockedUntil) < 0) return true;
            if (elapsed(nowNanos, entry.windowStarted) >= WINDOW_NANOS) stripe.entries.remove(normalizedIdentity);
            else if (entry.blockedUntil != 0) {
                entry.blockedUntil = 0;
                entry.failures = 0;
                entry.windowStarted = nowNanos;
            }
            return false;
        }
    }

    void failed(String normalizedIdentity, long nowNanos) {
        Objects.requireNonNull(normalizedIdentity, "normalizedIdentity");
        Stripe stripe = stripe(normalizedIdentity);
        synchronized (stripe) {
            Entry entry = stripe.entries.computeIfAbsent(normalizedIdentity, ignored -> new Entry(nowNanos));
            if (elapsed(nowNanos, entry.windowStarted) >= WINDOW_NANOS) {
                entry.windowStarted = nowNanos;
                entry.failures = 0;
                entry.blockedUntil = 0;
            }
            entry.failures++;
            if (entry.failures >= FAILURE_LIMIT) {
                entry.blockedUntil = nowNanos + BLOCK_NANOS;
                entry.failures = 0;
                entry.windowStarted = nowNanos;
            }
            trim(stripe);
        }
    }

    void succeeded(String normalizedIdentity) {
        Stripe stripe = stripe(normalizedIdentity);
        synchronized (stripe) { stripe.entries.remove(normalizedIdentity); }
    }

    private Stripe stripe(String identity) { return stripes[(identity.hashCode() & 0x7fffffff) % stripes.length]; }

    private static void trim(Stripe stripe) {
        while (stripe.entries.size() > ENTRIES_PER_STRIPE) {
            String eldest = stripe.entries.keySet().iterator().next();
            stripe.entries.remove(eldest);
        }
    }

    private static long elapsed(long now, long then) { return now - then; }

    private static final class Stripe {
        private final LinkedHashMap<String, Entry> entries = new LinkedHashMap<>(16, 0.75f, true);
    }

    private static final class Entry {
        private long windowStarted;
        private int failures;
        private long blockedUntil;
        private Entry(long windowStarted) { this.windowStarted = windowStarted; }
    }
}
