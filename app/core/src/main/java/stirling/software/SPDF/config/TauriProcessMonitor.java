package stirling.software.SPDF.config;

import java.lang.management.ManagementFactory;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

/**
 * Monitor for Tauri parent process to detect orphaned Java backend processes. When running in Tauri
 * mode, this component periodically checks if the parent Tauri process is still alive. If the
 * parent process terminates unexpectedly, this will trigger a graceful shutdown of the Java backend
 * to prevent orphaned processes.
 */
@Component
@ConditionalOnProperty(name = "STIRLING_PDF_TAURI_MODE", havingValue = "true")
public class TauriProcessMonitor {

    private static final Logger logger = LoggerFactory.getLogger(TauriProcessMonitor.class);

    private final ApplicationContext applicationContext;
    private String parentProcessId;
    private ScheduledExecutorService scheduler;
    private volatile boolean monitoring = false;

    public TauriProcessMonitor(ApplicationContext applicationContext) {
        this.applicationContext = applicationContext;
    }

    @PostConstruct
    public void init() {
        parentProcessId = System.getenv("TAURI_PARENT_PID");

        if (parentProcessId != null && !parentProcessId.trim().isEmpty()) {
            logger.info("Tauri mode detected. Parent process ID: {}", parentProcessId);
            startMonitoring();
        } else {
            logger.warn(
                    "TAURI_PARENT_PID environment variable not found. Tauri process monitoring disabled.");
        }
    }

    private void startMonitoring() {
        scheduler =
                Executors.newSingleThreadScheduledExecutor(
                        r -> {
                            Thread t = new Thread(r, "tauri-process-monitor");
                            t.setDaemon(true);
                            return t;
                        });

        monitoring = true;

        // Check every 5 seconds
        scheduler.scheduleAtFixedRate(this::checkParentProcess, 5, 5, TimeUnit.SECONDS);

        logger.info("Started monitoring parent Tauri process (PID: {})", parentProcessId);
    }

    private void checkParentProcess() {
        if (!monitoring) {
            return;
        }

        try {
            if (!isProcessAlive(parentProcessId)) {
                logger.warn(
                        "Parent Tauri process (PID: {}) is no longer alive. Initiating graceful shutdown...",
                        parentProcessId);
                initiateGracefulShutdown();
            }
        } catch (Exception e) {
            logger.error("Error checking parent process status", e);
        }
    }

    private boolean isProcessAlive(String pid) {
        try {
            long processId = Long.parseLong(pid);

            // Check if process exists using ProcessHandle (Java 9+)
            return ProcessHandle.of(processId).isPresent();

        } catch (NumberFormatException e) {
            logger.error("Invalid parent process ID format: {}", pid);
            return false;
        } catch (Exception e) {
            logger.error("Error checking if process {} is alive", pid, e);
            return false;
        }
    }

    private void initiateGracefulShutdown() {
        monitoring = false;

        logger.info("Orphaned Java backend detected. Shutting down gracefully...");

        // Shutdown asynchronously to avoid blocking the monitor thread
        CompletableFuture.runAsync(
                () -> {
                    try {
                        // Give a small delay to ensure logging completes
                        Thread.sleep(1000);

                        if (applicationContext instanceof ConfigurableApplicationContext) {
                            ((ConfigurableApplicationContext) applicationContext).close();
                        } else {
                            // Fallback to system exit
                            logger.warn(
                                    "Unable to shutdown Spring context gracefully, using System.exit");
                            System.exit(0);
                        }
                    } catch (Exception e) {
                        logger.error("Error during graceful shutdown", e);
                        System.exit(1);
                    }
                });
    }

    @PreDestroy
    public void cleanup() {
        monitoring = false;

        if (scheduler != null && !scheduler.isShutdown()) {
            logger.info("Shutting down Tauri process monitor");
            scheduler.shutdown();

            try {
                if (!scheduler.awaitTermination(2, TimeUnit.SECONDS)) {
                    scheduler.shutdownNow();
                }
            } catch (InterruptedException e) {
                scheduler.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }
    }

    /** Get the current Java process ID for logging/debugging purposes */
    public static String getCurrentProcessId() {
        try {
            return ManagementFactory.getRuntimeMXBean().getName().split("@")[0];
        } catch (Exception e) {
            return "unknown";
        }
    }
}
