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
    private final LongAdder invalidFrames = new LongAdder();
    private final LongAdder rejectedConnections = new LongAdder();

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
            if (sessions.putIfAbsent(session.id(), session) == null) return session;
            activeConnections.decrementAndGet();
        }
    }

    public boolean remove(UUID id) {
        Session removed = sessions.remove(id);
        if (removed == null) return false;
        removed.transition(removed.state(), Session.State.DISCONNECTED);
        activeConnections.decrementAndGet();
        return true;
    }

    public Session find(UUID id) { return sessions.get(id); }
    public int activeConnections() { return activeConnections.get(); }
    public int activeSessions() { return sessions.size(); }
    public long framesReceived() { return framesReceived.sum(); }
    public long framesSent() { return framesSent.sum(); }
    public long invalidFrames() { return invalidFrames.sum(); }
    public long rejectedConnections() { return rejectedConnections.sum(); }
    public void receivedFrame() { framesReceived.increment(); }
    public void sentFrame() { framesSent.increment(); }
    public void invalidFrame() { invalidFrames.increment(); }
    public void rejectedConnection() { rejectedConnections.increment(); }

    private static UUID randomSessionId() {
        ThreadLocalRandom random = ThreadLocalRandom.current();
        long mostSignificantBits = (random.nextLong() & 0xffff_ffff_ffff_0fffL) | 0x4000L;
        long leastSignificantBits = (random.nextLong() & 0x3fff_ffff_ffff_ffffL) | 0x8000_0000_0000_0000L;
        return new UUID(mostSignificantBits, leastSignificantBits);
    }
}
