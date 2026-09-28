package com.habbux.bootstrap;

import com.habbux.config.AppConfig;
import com.habbux.network.EventLoopRuntime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** One-shot foundation smoke check: initialize, report readiness and stop cleanly. */
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
            try (EventLoopRuntime runtime = new EventLoopRuntime(config)) {
                runtime.verifyReady();
                LOG.atInfo()
                        .addKeyValue("event", "emulator.ready")
                        .addKeyValue("environment", config.environment())
                        .addKeyValue("eventLoopThreads", config.eventLoopThreads())
                        .addKeyValue("mode", "bootstrap")
                        .log("Habbux Emulator ready");
            }
            LOG.atInfo().addKeyValue("event", "emulator.stopped").log("Habbux Emulator stopped");
            return 0;
        } catch (IllegalArgumentException exception) {
            LOG.atError()
                    .addKeyValue("event", "emulator.configuration_invalid")
                    .addKeyValue("category", "validation")
                    .log(exception.getMessage());
            return 2;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            LOG.atError().addKeyValue("event", "emulator.interrupted").log("Bootstrap interrupted");
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
