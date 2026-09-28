package com.habbux.network;

import com.habbux.config.AppConfig;
import com.habbux.auth.AuthExecutor;
import com.habbux.auth.AuthService;
import com.habbux.session.ConnectionRegistry;
import com.habbux.session.NetworkMetrics;
import com.habbux.room.RoomManager;
import com.habbux.room.RoomPayloadCodec;
import io.netty.bootstrap.ServerBootstrap;
import io.netty.channel.Channel;
import io.netty.channel.ChannelInitializer;
import io.netty.channel.ChannelOption;
import io.netty.channel.EventLoopGroup;
import io.netty.channel.MultiThreadIoEventLoopGroup;
import io.netty.channel.WriteBufferWaterMark;
import io.netty.channel.nio.NioIoHandler;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioServerSocketChannel;
import io.netty.util.concurrent.DefaultThreadFactory;
import io.netty.channel.group.ChannelGroup;
import io.netty.channel.group.DefaultChannelGroup;
import java.net.InetSocketAddress;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Owns the real WebSocket listener and all Netty resources. Lifecycle calls belong to a control thread. */
public final class HabbuxServer implements AutoCloseable {
    private static final Logger LOG = LoggerFactory.getLogger(HabbuxServer.class);
    private static final WriteBufferWaterMark WRITE_BUFFER_WATER_MARK = new WriteBufferWaterMark(
            32 * 1024, 64 * 1024);

    private final AppConfig config;
    private final ConnectionRegistry registry;
    private final EventLoopGroup bossGroup;
    private final EventLoopGroup workerGroup;
    private final ChannelGroup childChannels;
    private final ChannelInitializer<SocketChannel> initializer;
    private final AuthExecutor authExecutor;
    private final RoomManager roomManager;
    private Channel listener;

    public HabbuxServer(AppConfig config) {
        this(config, null, null);
    }

    public HabbuxServer(AppConfig config, AuthService authService, AuthExecutor authExecutor) {
        this(config, authService, authExecutor, null);
    }

    public HabbuxServer(AppConfig config, AuthService authService, AuthExecutor authExecutor, RoomManager roomManager) {
        this.config = config;
        this.authExecutor = authExecutor;
        this.roomManager = roomManager;
        if (roomManager != null && config.maxPayloadBytes() < RoomPayloadCodec.MAX_SNAPSHOT_PAYLOAD_BYTES) {
            throw new IllegalArgumentException("HABBUX_MAX_PAYLOAD_BYTES must be at least "
                    + RoomPayloadCodec.MAX_SNAPSHOT_PAYLOAD_BYTES + " when Room Engine is enabled");
        }
        registry = new ConnectionRegistry(config.maxConnections());
        bossGroup = new MultiThreadIoEventLoopGroup(1, new DefaultThreadFactory("habbux-boss"), NioIoHandler.newFactory());
        workerGroup = new MultiThreadIoEventLoopGroup(
                config.eventLoopThreads(), new DefaultThreadFactory("habbux-worker"), NioIoHandler.newFactory());
        childChannels = new DefaultChannelGroup("habbux-children", workerGroup.next());
        initializer = new CoreChannelInitializer(config, registry, childChannels, authService, roomManager);
    }

    public synchronized void start() throws InterruptedException {
        if (listener != null) throw new IllegalStateException("Habbux server has already started");
        listener = new ServerBootstrap()
                .group(bossGroup, workerGroup)
                .channel(NioServerSocketChannel.class)
                .option(ChannelOption.SO_BACKLOG, 128)
                .childOption(ChannelOption.TCP_NODELAY, true)
                .childOption(ChannelOption.WRITE_BUFFER_WATER_MARK, WRITE_BUFFER_WATER_MARK)
                .childHandler(initializer)
                .bind(new InetSocketAddress(config.bindHost(), config.port()))
                .sync()
                .channel();
        LOG.atInfo().addKeyValue("event", "emulator.server_listening")
                .addKeyValue("host", config.bindHost())
                .addKeyValue("port", localPort())
                .addKeyValue("protocolVersion", 1)
                .log("Habbux Core WebSocket listener ready");
    }

    public int localPort() {
        if (listener == null) throw new IllegalStateException("Habbux server is not listening");
        return ((InetSocketAddress) listener.localAddress()).getPort();
    }

    public void await() throws InterruptedException {
        if (listener == null) throw new IllegalStateException("Habbux server is not listening");
        listener.closeFuture().sync();
    }

    public ConnectionRegistry registry() { return registry; }

    @Override
    public synchronized void close() {
        if (listener == null && bossGroup.isTerminated() && workerGroup.isTerminated()) return;
        LOG.atInfo().addKeyValue("event", "emulator.server_stopping").log("Habbux Core server stopping");
        long timeout = config.shutdownTimeoutMillis();
        if (listener != null) listener.close().awaitUninterruptibly(timeout, TimeUnit.MILLISECONDS);
        childChannels.close().awaitUninterruptibly(timeout, TimeUnit.MILLISECONDS);
        boolean roomsStopped = roomManager == null || roomManager.close(java.time.Duration.ofMillis(timeout));
        boolean authStopped = authExecutor == null || authExecutor.shutdown(java.time.Duration.ofMillis(timeout));
        AuthExecutor.Metrics authMetrics = authExecutor == null ? null : authExecutor.snapshot();
        boolean bossStopped = bossGroup.shutdownGracefully(0, timeout, TimeUnit.MILLISECONDS)
                .awaitUninterruptibly(timeout + 1_000L, TimeUnit.MILLISECONDS);
        boolean workersStopped = workerGroup.shutdownGracefully(0, timeout, TimeUnit.MILLISECONDS)
                .awaitUninterruptibly(timeout + 1_000L, TimeUnit.MILLISECONDS);
        if (!roomsStopped || !authStopped || !bossStopped || !workersStopped || registry.activeConnections() != 0) {
            throw new IllegalStateException("Habbux server shutdown did not finish cleanly");
        }
        NetworkMetrics metrics = registry.metrics();
        LOG.atInfo().addKeyValue("event", "emulator.server_stopped")
                .addKeyValue("activeConnections", metrics.activeConnections())
                .addKeyValue("activeSessions", metrics.activeSessions())
                .addKeyValue("connectionsAccepted", metrics.connectionsAccepted())
                .addKeyValue("connectionsClosed", metrics.connectionsClosed())
                .addKeyValue("connectionsRejected", metrics.connectionsRejected())
                .addKeyValue("framesReceived", metrics.framesReceived())
                .addKeyValue("framesSent", metrics.framesSent())
                .addKeyValue("bytesReceived", metrics.bytesReceived())
                .addKeyValue("bytesSent", metrics.bytesSent())
                .addKeyValue("invalidFrames", metrics.invalidFrames())
                .addKeyValue("protocolViolations", metrics.protocolViolations())
                .addKeyValue("rateLimitDisconnects", metrics.rateLimitDisconnects())
                .addKeyValue("backpressureDisconnects", metrics.backpressureDisconnects())
                .addKeyValue("handshakeTimeouts", metrics.handshakeTimeouts())
                .addKeyValue("authExecutorActive", authMetrics == null ? 0 : authMetrics.active())
                .addKeyValue("authExecutorQueued", authMetrics == null ? 0 : authMetrics.queued())
                .addKeyValue("authExecutorRejected", authMetrics == null ? 0 : authMetrics.rejected())
                .addKeyValue("authExecutorCompleted", authMetrics == null ? 0 : authMetrics.completed())
                .addKeyValue("roomActive", roomManager == null ? 0 : roomManager.snapshot().activeRooms())
                .addKeyValue("roomWorkers", roomManager == null ? 0 : roomManager.snapshot().workerCount())
                .addKeyValue("roomRejected", roomManager == null ? 0 : roomManager.snapshot().rejectedEvents())
                .log("Habbux Core server stopped");
        listener = null;
    }
}
