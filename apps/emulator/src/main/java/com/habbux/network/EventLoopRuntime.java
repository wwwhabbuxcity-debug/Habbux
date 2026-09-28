package com.habbux.network;

import com.habbux.config.AppConfig;
import io.netty.channel.EventLoopGroup;
import io.netty.channel.MultiThreadIoEventLoopGroup;
import io.netty.channel.nio.NioIoHandler;
import io.netty.util.concurrent.DefaultThreadFactory;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Minimal Netty lifecycle owned by the bootstrap thread. Opens no listening socket.
 * This is not a game/network server; it exposes no task submission or channel API.
 */
public final class EventLoopRuntime implements AutoCloseable {
    private final EventLoopGroup group;
    private final int timeoutMillis;
    private boolean ready;

    public EventLoopRuntime(AppConfig config) {
        timeoutMillis = config.shutdownTimeoutMillis();
        group = new MultiThreadIoEventLoopGroup(
                config.eventLoopThreads(),
                new DefaultThreadFactory("habbux-io"),
                NioIoHandler.newFactory());
    }

    /** Waits on the bootstrap thread only, never on a Netty event loop. */
    public void verifyReady() throws InterruptedException, ExecutionException, TimeoutException {
        if (ready || group.isShuttingDown()) {
            throw new IllegalStateException("Event loop runtime must be new");
        }
        group.submit(() -> { }).get(timeoutMillis, TimeUnit.MILLISECONDS);
        ready = true;
    }

    public boolean isTerminated() {
        return group.isTerminated();
    }

    @Override
    public void close() {
        if (group.isTerminated()) {
            return;
        }
        // No channels or business tasks exist in this bootstrap, hence zero quiet period.
        boolean terminated = group.shutdownGracefully(0, timeoutMillis, TimeUnit.MILLISECONDS)
                .awaitUninterruptibly(timeoutMillis + 1_000L, TimeUnit.MILLISECONDS);
        if (!terminated || !group.isTerminated()) {
            throw new IllegalStateException("Event loop shutdown exceeded its deadline");
        }
    }
}
