package com.habbux.room;

/** Non-blocking outbound sink; Netty adapters enqueue immutable messages on the channel EventLoop. */
@FunctionalInterface
public interface RoomClient {
    void send(RoomOutbound message);
}
