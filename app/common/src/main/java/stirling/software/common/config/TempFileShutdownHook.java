package stirling.software.common.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;

import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFileRegistry;

/**
 * Handles cleanup of temporary files on application shutdown. Uses a CDI {@code @PreDestroy} method
 * (migrated from Spring's {@code DisposableBean}) to ensure cleanup happens during normal shutdown.
 */
@Slf4j
@ApplicationScoped
public class TempFileShutdownHook {

    private final TempFileRegistry registry;

    public TempFileShutdownHook(TempFileRegistry registry) {
        this.registry = registry;

        // Register a JVM shutdown hook as a backup in case Spring's
        // DisposableBean mechanism doesn't trigger (e.g., during a crash)
        Runtime.getRuntime().addShutdownHook(new Thread(this::cleanupTempFiles));
    }

    /** CDI pre-destroy callback (was DisposableBean#destroy). Called during normal shutdown. */
    @PreDestroy
    public void destroy() {
        log.info("Application shutting down, cleaning up temporary files");
        cleanupTempFiles();
    }

    /** Clean up all registered temporary files and directories. */
    private void cleanupTempFiles() {
        try {
            // Clean up all registered files
            Set<Path> files = registry.getAllRegisteredFiles();
            int deletedCount = 0;

            for (Path file : files) {
                try {
                    if (Files.exists(file)) {
                        Files.deleteIfExists(file);
                        deletedCount++;
                    }
                } catch (IOException e) {
                    log.warn("Failed to delete temp file during shutdown: {}", file, e);
                }
            }

            // Clean up all registered directories
            Set<Path> directories = registry.getTempDirectories();
            for (Path dir : directories) {
                try {
                    if (Files.exists(dir)) {
                        GeneralUtils.deleteDirectory(dir);
                        deletedCount++;
                    }
                } catch (IOException e) {
                    log.warn("Failed to delete temp directory during shutdown: {}", dir, e);
                }
            }

            log.info(
                    "Shutdown cleanup complete. Deleted {} temporary files/directories",
                    deletedCount);

            // Clear the registry
            registry.clear();
        } catch (Exception e) {
            log.error("Error during shutdown cleanup", e);
        }
    }
}
