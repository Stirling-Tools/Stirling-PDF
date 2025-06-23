package stirling.software.common.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import java.util.function.Predicate;
import java.util.stream.Stream;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

/**
 * Service to periodically clean up temporary files. Runs scheduled tasks to delete old temp files
 * and directories.
 */
@Slf4j
@Service
public class TempFileCleanupService {

    private final TempFileRegistry registry;
    private final TempFileManager tempFileManager;

    @Value("${stirling.tempfiles.cleanup-interval-minutes:30}")
    private long cleanupIntervalMinutes;

    @Value("${stirling.tempfiles.startup-cleanup:true}")
    private boolean performStartupCleanup;

    @Autowired
    @Qualifier("machineType")
    private String machineType;

    @Value("${stirling.tempfiles.system-temp-dir:/tmp}")
    private String systemTempDir;

    @Value("${stirling.tempfiles.directory:/tmp/stirling-pdf}")
    private String customTempDirectory;

    @Value("${stirling.tempfiles.libreoffice-dir:/tmp/stirling-pdf/libreoffice}")
    private String libreOfficeTempDir;

    // Maximum recursion depth for directory traversal
    private static final int MAX_RECURSION_DEPTH = 5;
    
    // File patterns that identify our temp files
    private static final Predicate<String> IS_OUR_TEMP_FILE = fileName -> 
        fileName.startsWith("stirling-pdf-") ||
        fileName.startsWith("output_") ||
        fileName.startsWith("compressedPDF") ||
        fileName.startsWith("pdf-save-") ||
        fileName.startsWith("pdf-stream-") ||
        fileName.startsWith("PDFBox") ||
        fileName.startsWith("input_") ||
        fileName.startsWith("overlay-");
        
    // File patterns that identify common system temp files
    private static final Predicate<String> IS_SYSTEM_TEMP_FILE = fileName -> 
        fileName.matches("lu\\d+[a-z0-9]*\\.tmp") ||
        fileName.matches("ocr_process\\d+") ||
        (fileName.startsWith("tmp") && !fileName.contains("jetty")) ||
        fileName.startsWith("OSL_PIPE_") ||
        (fileName.endsWith(".tmp") && !fileName.contains("jetty"));
        
    // File patterns that should be excluded from cleanup
    private static final Predicate<String> SHOULD_SKIP = fileName -> 
        fileName.contains("jetty") || 
        fileName.startsWith("jetty-") ||
        fileName.equals("proc") ||
        fileName.equals("sys") ||
        fileName.equals("dev");

    @Autowired
    public TempFileCleanupService(TempFileRegistry registry, TempFileManager tempFileManager) {
        this.registry = registry;
        this.tempFileManager = tempFileManager;

        // Create necessary directories
        ensureDirectoriesExist();

        // Perform startup cleanup if enabled
        if (performStartupCleanup) {
            runStartupCleanup();
        }
    }

    /** Ensure that all required temp directories exist */
    private void ensureDirectoriesExist() {
        try {
            // Create the main temp directory if specified
            if (customTempDirectory != null && !customTempDirectory.isEmpty()) {
                Path tempDir = Path.of(customTempDirectory);
                if (!Files.exists(tempDir)) {
                    Files.createDirectories(tempDir);
                    log.info("Created temp directory: {}", tempDir);
                }
            }

            // Create LibreOffice temp directory if specified
            if (libreOfficeTempDir != null && !libreOfficeTempDir.isEmpty()) {
                Path loTempDir = Path.of(libreOfficeTempDir);
                if (!Files.exists(loTempDir)) {
                    Files.createDirectories(loTempDir);
                    log.info("Created LibreOffice temp directory: {}", loTempDir);
                }
            }
        } catch (IOException e) {
            log.error("Error creating temp directories", e);
        }
    }

    /** Scheduled task to clean up old temporary files. Runs at the configured interval. */
    @Scheduled(
            fixedDelayString = "${stirling.tempfiles.cleanup-interval-minutes:60}",
            timeUnit = TimeUnit.MINUTES)
    public void scheduledCleanup() {
        log.info("Running scheduled temporary file cleanup");
        long maxAgeMillis = tempFileManager.getMaxAgeMillis();

        // Clean up registered temp files (managed by TempFileRegistry)
        int registeredDeletedCount = tempFileManager.cleanupOldTempFiles(maxAgeMillis);
        log.info("Cleaned up {} registered temporary files", registeredDeletedCount);

        // Clean up registered temp directories
        int directoriesDeletedCount = 0;
        for (Path directory : registry.getTempDirectories()) {
            try {
                if (Files.exists(directory)) {
                    GeneralUtils.deleteDirectory(directory);
                    directoriesDeletedCount++;
                    log.debug("Cleaned up temporary directory: {}", directory);
                }
            } catch (IOException e) {
                log.warn("Failed to clean up temporary directory: {}", directory, e);
            }
        }

        // Clean up unregistered temp files based on our cleanup strategy
        boolean containerMode = isContainerMode();
        int unregisteredDeletedCount = cleanupUnregisteredFiles(containerMode, true, maxAgeMillis);

        log.info(
                "Scheduled cleanup complete. Deleted {} registered files, {} unregistered files, {} directories",
                registeredDeletedCount,
                unregisteredDeletedCount,
                directoriesDeletedCount);
    }

    /**
     * Perform startup cleanup of stale temporary files from previous runs. This is especially
     * important in Docker environments where temp files persist between container restarts.
     */
    private void runStartupCleanup() {
        log.info("Running startup temporary file cleanup");
        boolean containerMode = isContainerMode();
        
        log.info(
                "Running in {} mode, using {} cleanup strategy",
                machineType,
                containerMode ? "aggressive" : "conservative");

        // For startup cleanup, we use a longer timeout for non-container environments
        long maxAgeMillis = containerMode ? 0 : 24 * 60 * 60 * 1000; // 0 or 24 hours
        
        int totalDeletedCount = cleanupUnregisteredFiles(containerMode, false, maxAgeMillis);
        
        log.info(
                "Startup cleanup complete. Deleted {} temporary files/directories",
                totalDeletedCount);
    }

    /**
     * Clean up unregistered temporary files across all configured temp directories.
     * 
     * @param containerMode Whether we're in container mode (more aggressive cleanup)
     * @param isScheduled Whether this is a scheduled cleanup or startup cleanup
     * @param maxAgeMillis Maximum age of files to clean in milliseconds
     * @return Number of files deleted
     */
    private int cleanupUnregisteredFiles(boolean containerMode, boolean isScheduled, long maxAgeMillis) {
        AtomicInteger totalDeletedCount = new AtomicInteger(0);
        
        try {
            // Get all directories we need to clean
            Path systemTempPath = getSystemTempPath();
            Path[] dirsToScan = {
                systemTempPath, 
                Path.of(customTempDirectory), 
                Path.of(libreOfficeTempDir)
            };

            // Process each directory
            Arrays.stream(dirsToScan)
                .filter(Files::exists)
                .forEach(tempDir -> {
                    try {
                        String phase = isScheduled ? "scheduled" : "startup";
                        log.info("Scanning directory for {} cleanup: {}", phase, tempDir);
                        
                        AtomicInteger dirDeletedCount = new AtomicInteger(0);
                        cleanupDirectoryStreaming(
                            tempDir, 
                            containerMode, 
                            0, 
                            maxAgeMillis,
                            isScheduled,
                            path -> {
                                dirDeletedCount.incrementAndGet();
                                if (log.isDebugEnabled()) {
                                    log.debug("Deleted temp file during {} cleanup: {}", phase, path);
                                }
                            }
                        );
                        
                        int count = dirDeletedCount.get();
                        totalDeletedCount.addAndGet(count);
                        if (count > 0) {
                            log.info("Cleaned up {} files/directories in {}", count, tempDir);
                        }
                    } catch (IOException e) {
                        log.error("Error during cleanup of directory: {}", tempDir, e);
                    }
                });
        } catch (Exception e) {
            log.error("Error during cleanup of unregistered files", e);
        }
        
        return totalDeletedCount.get();
    }

    /**
     * Get the system temp directory path based on configuration or system property.
     */
    private Path getSystemTempPath() {
        if (systemTempDir != null && !systemTempDir.isEmpty()) {
            return Path.of(systemTempDir);
        } else {
            return Path.of(System.getProperty("java.io.tmpdir"));
        }
    }
    
    /**
     * Determine if we're running in a container environment.
     */
    private boolean isContainerMode() {
        return "Docker".equals(machineType) || "Kubernetes".equals(machineType);
    }

    /**
     * Recursively clean up a directory using a streaming approach to reduce memory usage.
     *
     * @param directory The directory to clean
     * @param containerMode Whether we're in container mode (more aggressive cleanup)
     * @param depth Current recursion depth
     * @param maxAgeMillis Maximum age of files to delete
     * @param isScheduled Whether this is a scheduled cleanup (vs startup)
     * @param onDeleteCallback Callback function when a file is deleted
     * @throws IOException If an I/O error occurs
     */
    private void cleanupDirectoryStreaming(
            Path directory, 
            boolean containerMode, 
            int depth, 
            long maxAgeMillis,
            boolean isScheduled,
            Consumer<Path> onDeleteCallback) throws IOException {
        
        // Check recursion depth limit
        if (depth > MAX_RECURSION_DEPTH) {
            log.warn("Maximum directory recursion depth reached for: {}", directory);
            return;
        }

        // Use try-with-resources to ensure the stream is closed
        try (Stream<Path> pathStream = Files.list(directory)) {
            // Process files in a streaming fashion instead of materializing the whole list
            pathStream.forEach(path -> {
                try {
                    String fileName = path.getFileName().toString();

                    // Skip if file should be excluded
                    if (SHOULD_SKIP.test(fileName)) {
                        return;
                    }

                    // Handle directories recursively
                    if (Files.isDirectory(path)) {
                        try {
                            cleanupDirectoryStreaming(
                                path, containerMode, depth + 1, maxAgeMillis, isScheduled, onDeleteCallback);
                        } catch (IOException e) {
                            log.warn("Error processing subdirectory: {}", path, e);
                        }
                        return;
                    }

                    // Skip registered files - these are handled by TempFileManager
                    if (isScheduled && registry.contains(path.toFile())) {
                        return;
                    }

                    // Check if this file should be deleted
                    if (shouldDeleteFile(path, fileName, containerMode, maxAgeMillis)) {
                        try {
                            Files.deleteIfExists(path);
                            onDeleteCallback.accept(path);
                        } catch (IOException e) {
                            // Handle locked files more gracefully
                            if (e.getMessage() != null && e.getMessage().contains("being used by another process")) {
                                log.debug("File locked, skipping delete: {}", path);
                            } else {
                                log.warn("Failed to delete temp file: {}", path, e);
                            }
                        }
                    }
                } catch (Exception e) {
                    log.warn("Error processing path: {}", path, e);
                }
            });
        }
    }

    /**
     * Determine if a file should be deleted based on its name, age, and other criteria.
     */
    private boolean shouldDeleteFile(Path path, String fileName, boolean containerMode, long maxAgeMillis) {
        // First check if it matches our known temp file patterns
        boolean isOurTempFile = IS_OUR_TEMP_FILE.test(fileName);
        boolean isSystemTempFile = IS_SYSTEM_TEMP_FILE.test(fileName);
        boolean shouldDelete = isOurTempFile || (containerMode && isSystemTempFile);

        // Special case for zero-byte files - these are often corrupted temp files
        try {
            if (Files.size(path) == 0) {
                // For empty files, use a shorter timeout (5 minutes)
                long lastModified = Files.getLastModifiedTime(path).toMillis();
                long currentTime = System.currentTimeMillis();
                // Delete empty files older than 5 minutes
                if ((currentTime - lastModified) > 5 * 60 * 1000) {
                    shouldDelete = true;
                }
            }
        } catch (IOException e) {
            log.debug("Could not check file size, skipping: {}", path);
        }

        // Check file age against maxAgeMillis
        if (shouldDelete && maxAgeMillis > 0) {
            try {
                long lastModified = Files.getLastModifiedTime(path).toMillis();
                long currentTime = System.currentTimeMillis();
                shouldDelete = (currentTime - lastModified) > maxAgeMillis;
            } catch (IOException e) {
                log.debug("Could not check file age, skipping: {}", path);
                shouldDelete = false;
            }
        }

        return shouldDelete;
    }

    /** Clean up LibreOffice temporary files. This method is called after LibreOffice operations. */
    public void cleanupLibreOfficeTempFiles() {
        // Cleanup known LibreOffice temp directories
        try {
            Set<Path> directories = registry.getTempDirectories();
            for (Path dir : directories) {
                if (dir.getFileName().toString().contains("libreoffice") && Files.exists(dir)) {
                    // For directories containing "libreoffice", delete all contents
                    // but keep the directory itself for future use
                    cleanupDirectoryStreaming(
                        dir,
                        isContainerMode(),
                        0,
                        0, // age doesn't matter for LibreOffice cleanup
                        false,
                        path -> log.debug("Cleaned up LibreOffice temp file: {}", path)
                    );
                    log.debug("Cleaned up LibreOffice temp directory contents: {}", dir);
                }
            }
        } catch (IOException e) {
            log.warn("Failed to clean up LibreOffice temp files", e);
        }
    }
}