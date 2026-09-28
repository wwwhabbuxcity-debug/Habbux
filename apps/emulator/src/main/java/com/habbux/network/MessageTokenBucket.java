package com.habbux.network;

/** Per-channel token bucket. Access is confined to that channel's Netty event loop. */
final class MessageTokenBucket {
    private final int ratePerSecond;
    private final int burst;
    private double available;
    private long lastRefillNanos;

    MessageTokenBucket(int ratePerSecond, int burst, long nowNanos) {
        this.ratePerSecond = ratePerSecond;
        this.burst = burst;
        available = burst;
        lastRefillNanos = nowNanos;
    }

    boolean tryAcquire(long nowNanos) {
        long elapsedNanos = nowNanos - lastRefillNanos;
        if (elapsedNanos > 0) {
            available = Math.min(burst, available + elapsedNanos * (ratePerSecond / 1_000_000_000.0));
            lastRefillNanos = nowNanos;
        }
        if (available < 1.0) return false;
        available -= 1.0;
        return true;
    }
}
