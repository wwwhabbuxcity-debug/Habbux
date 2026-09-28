package com.habbux.session;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.LongAdder;

/** Concurrent bounded admission and idempotent cleanup for local transport sessions. */
public final class ConnectionRegistry {
    private final int maxConnections;
    private final ConcurrentHashMap<UUID, Session> sessions = new ConcurrentHashMap<>();
    private final AtomicInteger activeConnections = new AtomicInteger();
    private final LongAdder framesReceived = new LongAdder();
    private final LongAdder framesSent = new LongAdder();
    private final LongAdder bytesReceived = new LongAdder();
    private final LongAdder bytesSent = new LongAdder();
    private final LongAdder invalidFrames = new LongAdder();
    private final LongAdder rejectedConnections = new LongAdder();
    private final LongAdder connectionsAccepted = new LongAdder();
    private final LongAdder connectionsClosed = new LongAdder();
    private final LongAdder protocolViolations = new LongAdder();
    private final LongAdder rateLimitDisconnects = new LongAdder();
    private final LongAdder backpressureDisconnects = new LongAdder();
    private final LongAdder handshakeTimeouts = new LongAdder();

    public ConnectionRegistry(int maxConnections) { this.maxConnections = maxConnections; }

    public Session tryConnect() {
        while (true) {
            int current = activeConnections.get();
            if (current >= maxConnections) {
                rejectedConnections.increment();
                return null;
            }
            if (!activeConnections.compareAndSet(current, current + 1)) continue;
            Session session = new Session(randomSessionId());
            if (sessions.putIfAbsent(session.id(), session) == null) {
                connectionsAccepted.increment();
                return session;
            }
            activeConnections.decrementAndGet();
        }
    }

    public boolean remove(UUID id) {
        Session removed = sessions.remove(id);
        if (removed == null) return false;
        removed.transition(removed.state(), Session.State.DISCONNECTED);
        activeConnections.decrementAndGet();
        connectionsClosed.increment();
        return true;
    }

    public Session find(UUID id) { return sessions.get(id); }
    public int activeConnections() { return activeConnections.get(); }
    public int activeSessions() { return sessions.size(); }
    public long framesReceived() { return framesReceived.sum(); }
    public long framesSent() { return framesSent.sum(); }
    public long bytesReceived() { return bytesReceived.sum(); }
    public long bytesSent() { return bytesSent.sum(); }
    public long invalidFrames() { return invalidFrames.sum(); }
    public long rejectedConnections() { return rejectedConnections.sum(); }
    public NetworkMetrics metrics() {
        return new NetworkMetrics(activeConnections(), activeSessions(), connectionsAccepted.sum(),
                connectionsClosed.sum(), rejectedConnections.sum(), framesReceived.sum(), framesSent.sum(),
                bytesReceived.sum(), bytesSent.sum(), invalidFrames.sum(), protocolViolations.sum(),
                rateLimitDisconnects.sum(), backpressureDisconnects.sum(), handshakeTimeouts.sum());
    }
    public void receivedFrame() { framesReceived.increment(); }
    public void sentFrame() { framesSent.increment(); }
    public void receivedBytes(long bytes) { bytesReceived.add(bytes); }
    public void sentBytes(long bytes) { bytesSent.add(bytes); }
    public void invalidFrame() { invalidFrames.increment(); }
    public void rejectedConnection() { rejectedConnections.increment(); }
    public void protocolViolation() { protocolViolations.increment(); }
    public void rateLimitDisconnect() { rateLimitDisconnects.increment(); }
    public void backpressureDisconnect() { backpressureDisconnects.increment(); }
    public void handshakeTimeout() { handshakeTimeouts.increment(); }

    private static UUID randomSessionId() {
        ThreadLocalRandom random = ThreadLocalRandom.current();
        long mostSignificantBits = (random.nextLong() & 0xffff_ffff_ffff_0fffL) | 0x4000L;
        long leastSignificantBits = (random.nextLong() & 0x3fff_ffff_ffff_ffffL) | 0x8000_0000_0000_0000L;
        return new UUID(mostSignificantBits, leastSignificantBits);
    }
}
