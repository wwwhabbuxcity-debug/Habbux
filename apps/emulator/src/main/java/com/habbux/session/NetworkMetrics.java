package com.habbux.session;

/** Immutable point-in-time counters for the local Core network process. */
public record NetworkMetrics(
        int activeConnections,
        int activeSessions,
        long connectionsAccepted,
        long connectionsClosed,
        long connectionsRejected,
        long framesReceived,
        long framesSent,
        long bytesReceived,
        long bytesSent,
        long invalidFrames,
        long protocolViolations,
        long rateLimitDisconnects,
        long backpressureDisconnects,
        long handshakeTimeouts) { }
