package stirling.software.common.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.beans.factory.DisposableBean;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFileRegistry;

/**
 * Handles cleanup of temporary files on application shutdown. Implements Spring's DisposableBean
 * interface to ensure cleanup happens during normal application shutdown.
 */
@Slf4j
@Component
public class TempFileShutdownHook implements DisposableBean {

    private final TempFileRegistry registry;
    private final AtomicBoolean cleanupExecuted = new AtomicBoolean(false);

    public TempFileShutdownHook(TempFileRegistry registry) {
        this.registry = registry;

        // Register a JVM shutdown hook as a backup in case Spring's
        // DisposableBean mechanism doesn't trigger (e.g., during a crash)
        Runtime.getRuntime()
                .addShutdownHook(
                        new Thread(
                                () -> {
                                    log.info("JVM shutdown hook executing");
                                    cleanupTempFiles();
                                },
                                "temp-file-cleanup-hook"));
    }

    /** Spring's DisposableBean interface method. Called during normal application shutdown. */
    @Override
    public void destroy() {
        log.info("Spring DisposableBean destroy() called, cleaning up temporary files");
        cleanupTempFiles();
    }

    /** Clean up all registered temporary files and directories. */
    private void cleanupTempFiles() {
        // Ensure cleanup only runs once, even if called from multiple sources
        if (!cleanupExecuted.compareAndSet(false, true)) {
            log.debug("Cleanup already executed, skipping duplicate execution");
            return;
        }

        try {
            // Get snapshot of registered files before cleanup
            Set<Path> files = registry.getAllRegisteredFiles();
            Set<Path> directories = registry.getTempDirectories();

            log.info(
                    "Starting cleanup: {} files and {} directories registered",
                    files.size(),
                    directories.size());

            int deletedFileCount = 0;
            int failedFileCount = 0;

            // Clean up all registered files
            for (Path file : files) {
                try {
                    if (Files.exists(file)) {
                        boolean deleted = Files.deleteIfExists(file);
                        if (deleted) {
                            deletedFileCount++;
                            log.debug("Deleted temp file: {}", file);
                        } else {
                            failedFileCount++;
                            log.warn(
                                    "Failed to delete temp file (deleteIfExists returned false): {}",
                                    file);
                        }
                    } else {
                        log.debug("Temp file already deleted: {}", file);
                    }
                } catch (IOException e) {
                    failedFileCount++;
                    log.warn("Failed to delete temp file during shutdown: {}", file, e);
                }
            }

            int deletedDirCount = 0;
            int failedDirCount = 0;

            // Clean up all registered directories
            for (Path dir : directories) {
                try {
                    if (Files.exists(dir)) {
                        GeneralUtils.deleteDirectory(dir);
                        deletedDirCount++;
                        log.debug("Deleted temp directory: {}", dir);
                    } else {
                        log.debug("Temp directory already deleted: {}", dir);
                    }
                } catch (IOException e) {
                    failedDirCount++;
                    log.warn("Failed to delete temp directory during shutdown: {}", dir, e);
                }
            }

            log.info(
                    "Shutdown cleanup complete. Deleted {} files ({} failed) and {} directories ({} failed)",
                    deletedFileCount,
                    failedFileCount,
                    deletedDirCount,
                    failedDirCount);

            if (failedFileCount > 0 || failedDirCount > 0) {
                log.warn(
                        "Some temporary files/directories could not be deleted. They may need manual cleanup.");
            }

            // Clear the registry
            registry.clear();
        } catch (Exception e) {
            log.error("Error during shutdown cleanup", e);
        }
    }
}
