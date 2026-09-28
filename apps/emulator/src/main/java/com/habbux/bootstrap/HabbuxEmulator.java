package com.habbux.bootstrap;

import com.habbux.config.AppConfig;
import com.habbux.network.HabbuxServer;
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
            AppConfig config = AppConfig.from(System.getenv());
            try (HabbuxServer server = new HabbuxServer(config)) {
                Runtime.getRuntime().addShutdownHook(new Thread(server::close, "habbux-shutdown"));
                server.start();
                LOG.atInfo().addKeyValue("event", "emulator.ready")
                        .addKeyValue("environment", config.environment())
                        .addKeyValue("eventLoopThreads", config.eventLoopThreads())
                        .log("Habbux Emulator ready");
                server.await();
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
}
