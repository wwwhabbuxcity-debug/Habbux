package com.habbux.bootstrap;

import com.habbux.config.AppConfig;
import com.habbux.network.HabbuxServer;
import com.habbux.auth.AuthExecutor;
import com.habbux.auth.AuthService;
import com.habbux.persistence.DatabaseConfig;
import com.habbux.persistence.DatabasePool;
import com.habbux.security.Argon2idPasswordHasher;
import com.habbux.user.UserRepository;
import com.habbux.room.RoomConfig;
import com.habbux.room.RoomManager;
import com.habbux.persistence.RoomRepository;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Long-lived Core WebSocket server process. */
public final class HabbuxEmulator {
    private static final Logger LOG = LoggerFactory.getLogger(HabbuxEmulator.class);

    private HabbuxEmulator() { }

    public static void main(String[] args) {
        int status = run();
        if (status != 0) {
            System.exit(status);
        }
    }

    private static int run() {
        LOG.atInfo().addKeyValue("event", "emulator.starting").log("Habbux Emulator starting");
        try {
            Map<String, String> environment = System.getenv();
            AppConfig config = AppConfig.from(environment);
            DatabaseConfig databaseConfig = environment.containsKey("POSTGRES_HOST")
                    ? DatabaseConfig.from(environment) : null;
            try (DatabasePool database = databaseConfig == null ? null : new DatabasePool(databaseConfig);
                 AuthExecutor authExecutor = AuthExecutor.fromEnvironment(environment)) {
                try {
                    AuthService authService = new AuthService(database == null ? null : new UserRepository(database.dataSource()),
                            authExecutor, new Argon2idPasswordHasher());
                    RoomManager roomManager = database == null ? null
                            : RoomManager.backedBy(new RoomRepository(database.dataSource()), RoomConfig.from(environment));
                    if (database == null) {
                        LOG.atWarn().addKeyValue("event", "auth.database_unconfigured")
                                .log("Habbux auth is unavailable until PostgreSQL is configured");
                    }
                    try (HabbuxServer server = new HabbuxServer(config, authService, authExecutor, roomManager)) {
                        Runtime.getRuntime().addShutdownHook(new Thread(
                                () -> shutdownServerAndLogPool(server, database), "habbux-shutdown"));
                        server.start();
                        LOG.atInfo().addKeyValue("event", "emulator.ready")
                                .addKeyValue("environment", config.environment())
                                .addKeyValue("eventLoopThreads", config.eventLoopThreads())
                                .log("Habbux Emulator ready");
                        server.await();
                    }
                } finally {
                    logDatabasePool(database);
                }
            }
            return 0;
        } catch (IllegalArgumentException exception) {
            LOG.atError()
                    .addKeyValue("event", "emulator.configuration_invalid")
                    .addKeyValue("category", "validation")
                    .log(exception.getMessage());
            return 2;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            LOG.atError().addKeyValue("event", "emulator.interrupted").log("Emulator interrupted");
            return 1;
        } catch (Exception exception) {
            LOG.atError()
                    .addKeyValue("event", "emulator.start_failed")
                    .addKeyValue("category", "infrastructure")
                    .setCause(exception)
                    .log("Unable to initialize emulator bootstrap");
            return 1;
        }
    }

    private static void logDatabasePool(DatabasePool database) {
        if (database == null) return;
        var pool = database.snapshot();
        LOG.atInfo().addKeyValue("event", "emulator.database_pool_stopped")
                .addKeyValue("active", pool.active())
                .addKeyValue("idle", pool.idle())
                .addKeyValue("pending", pool.pending())
                .log("Habbux PostgreSQL pool stopped");
    }

    private static void shutdownServerAndLogPool(HabbuxServer server, DatabasePool database) {
        try { server.close(); }
        finally { logDatabasePool(database); }
    }
}
