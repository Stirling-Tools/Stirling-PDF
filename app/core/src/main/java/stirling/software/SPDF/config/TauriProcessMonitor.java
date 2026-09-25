package stirling.software.SPDF.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

/**
 * Shuts the backend down when the Tauri desktop app exits. The app writes a sentinel file (works on
 * every platform, unlike signals); the parent PID check covers a crashed app.
 */
@Component
@ConditionalOnProperty(name = "STIRLING_PDF_TAURI_MODE", havingValue = "true")
public class TauriProcessMonitor {

    private static final Logger logger = LoggerFactory.getLogger(TauriProcessMonitor.class);

    // A stat every 250 ms keeps app close responsive at negligible cost.
    private static final long SENTINEL_POLL_MILLIS = 250;
    private static final long PARENT_POLL_SECONDS = 5;
    private static final LinkOption[] NO_LINKS = new LinkOption[0];

    private final ApplicationContext applicationContext;
    private final AtomicBoolean monitoring = new AtomicBoolean(false);
    private final AtomicBoolean shutdownInitiated = new AtomicBoolean(false);

    private ProcessHandle parentHandle;
    private Path shutdownFile;
    private ScheduledExecutorService scheduler;

    public TauriProcessMonitor(ApplicationContext applicationContext) {
        this.applicationContext = applicationContext;
    }

    @PostConstruct
    public void init() {
        init(System.getenv("TAURI_PARENT_PID"), System.getenv("STIRLING_PDF_SHUTDOWN_FILE"));
    }

    /** Package-private so tests can supply the environment instead of mutating the JVM's. */
    void init(String parentPidEnv, String shutdownFilePathEnv) {
        Long parentPid = parseParentPid(parentPidEnv);
        parentHandle = parentPid == null ? null : ProcessHandle.of(parentPid).orElse(null);
        shutdownFile = parseShutdownFile(shutdownFilePathEnv);
        if (parentPid == null && shutdownFile == null) {
            logger.warn("Tauri mode without TAURI_PARENT_PID or STIRLING_PDF_SHUTDOWN_FILE");
            return;
        }
        if (shutdownFile != null) {
            // A stale sentinel from a crashed session must not stop this one.
            try {
                Files.deleteIfExists(shutdownFile);
            } catch (IOException e) {
                logger.warn("Could not clear stale shutdown file: {}", e.getMessage());
            }
        }
        if (parentPid != null && parentHandle == null) {
            // Tauri wrote the sentinel and exited while this JVM was starting; no
            // process is left to write it again, so the parent check is the only
            // trigger and the backend would otherwise outlive the app.
            logger.info("Tauri parent process {} is already gone; shutting down", parentPid);
            initiateGracefulShutdown("parent process already exited");
            return;
        }
        startMonitoring();
    }

    private static Long parseParentPid(String pid) {
        if (pid == null || pid.isBlank()) return null;
        try {
            return Long.parseLong(pid.trim());
        } catch (NumberFormatException e) {
            logger.error("Invalid TAURI_PARENT_PID: {}", pid);
            return null;
        }
    }

    private static Path parseShutdownFile(String path) {
        return path == null || path.isBlank() ? null : Path.of(path);
    }

    private void startMonitoring() {
        scheduler =
                Executors.newSingleThreadScheduledExecutor(
                        r -> Thread.ofVirtual().name("tauri-process-monitor").unstarted(r));
        monitoring.set(true);
        if (shutdownFile != null) {
            scheduler.scheduleWithFixedDelay(
                    this::checkShutdownFile, 0, SENTINEL_POLL_MILLIS, TimeUnit.MILLISECONDS);
        }
        if (parentHandle != null) {
            scheduler.scheduleWithFixedDelay(
                    this::checkParentProcess,
                    PARENT_POLL_SECONDS,
                    PARENT_POLL_SECONDS,
                    TimeUnit.SECONDS);
        }
        logger.info(
                "Monitoring Tauri parent {} and shutdown file {}",
                parentHandle == null ? "-" : parentHandle.pid(),
                shutdownFile);
    }

    private void checkShutdownFile() {
        if (!monitoring.get() || shutdownFile == null) return;
        if (!Files.exists(shutdownFile, NO_LINKS)) return;
        try {
            Files.deleteIfExists(shutdownFile);
        } catch (IOException e) {
            logger.debug("Could not delete shutdown file: {}", e.getMessage());
        }
        initiateGracefulShutdown("shutdown file");
    }

    private void checkParentProcess() {
        if (!monitoring.get() || parentHandle == null) return;
        if (!parentHandle.isAlive()) {
            initiateGracefulShutdown("parent process exit");
        }
    }

    private void initiateGracefulShutdown(String reason) {
        if (!shutdownInitiated.compareAndSet(false, true)) return;
        monitoring.set(false);
        logger.info("Shutting down backend: {}", reason);
        Thread.ofVirtual()
                .name("tauri-graceful-shutdown")
                .start(
                        () -> {
                            try {
                                if (applicationContext
                                        instanceof ConfigurableApplicationContext context) {
                                    context.close();
                                } else {
                                    System.exit(0);
                                }
                            } catch (Exception e) {
                                logger.error("Graceful shutdown failed", e);
                                System.exit(1);
                            }
                        });
    }

    @PreDestroy
    public void cleanup() {
        monitoring.set(false);
        if (scheduler == null || scheduler.isShutdown()) return;
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
