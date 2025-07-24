package stirling.software.common.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;
import java.util.function.Predicate;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.annotation.Async;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

/**
 * Service to periodically clean up temporary files. Runs scheduled tasks to delete old temp files
 * and directories.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TempFileCleanupService {

    private final TempFileRegistry registry;
    private final TempFileManager tempFileManager;
    private final ApplicationProperties applicationProperties;

    @Autowired
    @Qualifier("machineType")
    private String machineType;

    // Maximum recursion depth for directory traversal
    private static final int MAX_RECURSION_DEPTH = 5;

    // Maximum consecutive failures before aborting batch cleanup
    private static final int MAX_CONSECUTIVE_FAILURES = 10;

    // Cleanup state management
    private final AtomicBoolean cleanupRunning = new AtomicBoolean(false);
    private final AtomicLong lastCleanupDuration = new AtomicLong(0);
    private final AtomicLong cleanupCount = new AtomicLong(0);
    private final AtomicLong lastCleanupTimestamp = new AtomicLong(0);

    // File patterns that identify our temp files
    private static final Predicate<String> IS_OUR_TEMP_FILE =
            fileName ->
                    fileName.startsWith("stirling-pdf-")
                            || fileName.startsWith("output_")
                            || fileName.startsWith("compressedPDF")
                            || fileName.startsWith("pdf-save-")
                            || fileName.startsWith("pdf-stream-")
                            || fileName.startsWith("PDFBox")
                            || fileName.startsWith("input_")
                            || fileName.startsWith("overlay-");

    // File patterns that identify common system temp files
    private static final Predicate<String> IS_SYSTEM_TEMP_FILE =
            fileName ->
                    fileName.matches("lu\\d+[a-z0-9]*\\.tmp")
                            || fileName.matches("ocr_process\\d+")
                            || (fileName.startsWith("tmp") && !fileName.contains("jetty"))
                            || fileName.startsWith("OSL_PIPE_")
                            || (fileName.endsWith(".tmp") && !fileName.contains("jetty"));

    // File patterns that should be excluded from cleanup
    private static final Predicate<String> SHOULD_SKIP =
            fileName ->
                    fileName.contains("jetty")
                            || fileName.startsWith("jetty-")
                            || "proc".equals(fileName)
                            || "sys".equals(fileName)
                            || "dev".equals(fileName)
                            || "hsperfdata_stirlingpdfuser".equals(fileName)
                            || fileName.startsWith("hsperfdata_")
                            || ".pdfbox.cache".equals(fileName);

    @PostConstruct
    public void init() {
        // Create necessary directories
        ensureDirectoriesExist();

        // Perform startup cleanup if enabled
        if (applicationProperties.getSystem().getTempFileManagement().isStartupCleanup()) {
            runStartupCleanup();
        }
    }

    /** Ensure that all required temp directories exist */
    private void ensureDirectoriesExist() {
        try {
            ApplicationProperties.TempFileManagement tempFiles =
                    applicationProperties.getSystem().getTempFileManagement();

            // Create the main temp directory
            String customTempDirectory = tempFiles.getBaseTmpDir();
            if (customTempDirectory != null && !customTempDirectory.isEmpty()) {
                Path tempDir = Path.of(customTempDirectory);
                if (!Files.exists(tempDir)) {
                    Files.createDirectories(tempDir);
                    log.info("Created temp directory: {}", tempDir);
                }
            }

            // Create LibreOffice temp directory
            String libreOfficeTempDir = tempFiles.getLibreofficeDir();
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
    @Async("cleanupExecutor")
    @Scheduled(
            fixedDelayString =
                    "#{applicationProperties.system.tempFileManagement.cleanupIntervalMinutes}",
            timeUnit = TimeUnit.MINUTES)
    public CompletableFuture<Void> scheduledCleanup() {
        // Check if cleanup is already running
        if (!cleanupRunning.compareAndSet(false, true)) {
            log.warn(
                    "Cleanup already in progress (running for {}ms), skipping this cycle",
                    System.currentTimeMillis() - lastCleanupTimestamp.get());
            return CompletableFuture.completedFuture(null);
        }

        // Calculate timeout as 2x cleanup interval
        long timeoutMinutes =
                applicationProperties
                                .getSystem()
                                .getTempFileManagement()
                                .getCleanupIntervalMinutes()
                        * 2;

        CompletableFuture<Void> cleanupFuture =
                CompletableFuture.runAsync(
                        () -> {
                            long startTime = System.currentTimeMillis();
                            lastCleanupTimestamp.set(startTime);
                            long cleanupNumber = cleanupCount.incrementAndGet();

                            try {
                                log.info(
                                        "Starting cleanup #{} with {}min timeout",
                                        cleanupNumber,
                                        timeoutMinutes);
                                doScheduledCleanup();

                                long duration = System.currentTimeMillis() - startTime;
                                lastCleanupDuration.set(duration);
                                log.info(
                                        "Cleanup #{} completed successfully in {}ms",
                                        cleanupNumber,
                                        duration);
                            } catch (Exception e) {
                                long duration = System.currentTimeMillis() - startTime;
                                lastCleanupDuration.set(duration);
                                log.error(
                                        "Cleanup #{} failed after {}ms",
                                        cleanupNumber,
                                        duration,
                                        e);
                            } finally {
                                cleanupRunning.set(false);
                            }
                        });

        return cleanupFuture
                .orTimeout(timeoutMinutes, TimeUnit.MINUTES)
                .exceptionally(
                        throwable -> {
                            if (throwable.getCause() instanceof TimeoutException) {
                                log.error(
                                        "Cleanup #{} timed out after {}min - forcing cleanup state reset",
                                        cleanupCount.get(),
                                        timeoutMinutes);
                                cleanupRunning.set(false);
                            }
                            return null;
                        });
    }

    /** Internal method that performs the actual cleanup work */
    private void doScheduledCleanup() {
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

        // Clean up PDFBox cache file
        cleanupPDFBoxCache();

        // Clean up unregistered temp files based on our cleanup strategy
        boolean containerMode = isContainerMode();
        int unregisteredDeletedCount = cleanupUnregisteredFiles(containerMode, true, maxAgeMillis);

        if (registeredDeletedCount > 0
                || unregisteredDeletedCount > 0
                || directoriesDeletedCount > 0) {
            log.info(
                    "Scheduled cleanup complete. Deleted {} registered files, {} unregistered files, {} directories",
                    registeredDeletedCount,
                    unregisteredDeletedCount,
                    directoriesDeletedCount);
        }
    }

    /**
     * Perform startup cleanup of stale temporary files from previous runs. This is especially
     * important in Docker environments where temp files persist between container restarts.
     */
    private void runStartupCleanup() {
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
    private int cleanupUnregisteredFiles(
            boolean containerMode, boolean isScheduled, long maxAgeMillis) {
        AtomicInteger totalDeletedCount = new AtomicInteger(0);

        try {
            ApplicationProperties.TempFileManagement tempFiles =
                    applicationProperties.getSystem().getTempFileManagement();
            Path[] dirsToScan;
            if (tempFiles.isCleanupSystemTemp()
                    && tempFiles.getSystemTempDir() != null
                    && !tempFiles.getSystemTempDir().isEmpty()) {
                Path systemTempPath = getSystemTempPath();
                dirsToScan =
                        new Path[] {
                            systemTempPath,
                            Path.of(tempFiles.getBaseTmpDir()),
                            Path.of(tempFiles.getLibreofficeDir())
                        };
            } else {
                dirsToScan =
                        new Path[] {
                            Path.of(tempFiles.getBaseTmpDir()),
                            Path.of(tempFiles.getLibreofficeDir())
                        };
            }

            // Process each directory
            Arrays.stream(dirsToScan)
                    .filter(Files::exists)
                    .forEach(
                            tempDir -> {
                                try {
                                    String phase = isScheduled ? "scheduled" : "startup";
                                    log.debug(
                                            "Scanning directory for {} cleanup: {}",
                                            phase,
                                            tempDir);

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
                                                    log.debug(
                                                            "Deleted temp file during {} cleanup: {}",
                                                            phase,
                                                            path);
                                                }
                                            });

                                    int count = dirDeletedCount.get();
                                    totalDeletedCount.addAndGet(count);
                                    if (count > 0) {
                                        log.info(
                                                "Cleaned up {} files/directories in {}",
                                                count,
                                                tempDir);
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

    /** Get the system temp directory path based on configuration or system property. */
    private Path getSystemTempPath() {
        String systemTempDir =
                applicationProperties.getSystem().getTempFileManagement().getSystemTempDir();
        if (systemTempDir != null && !systemTempDir.isEmpty()) {
            return Path.of(systemTempDir);
        } else {
            return Path.of(System.getProperty("java.io.tmpdir"));
        }
    }

    /** Determine if we're running in a container environment. */
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
            Consumer<Path> onDeleteCallback)
            throws IOException {

        if (depth > MAX_RECURSION_DEPTH) {
            log.debug("Maximum directory recursion depth reached for: {}", directory);
            return;
        }

        java.util.List<Path> subdirectories = new java.util.ArrayList<>();
        int batchSize = applicationProperties.getSystem().getTempFileManagement().getBatchSize();
        long pauseMs =
                applicationProperties
                        .getSystem()
                        .getTempFileManagement()
                        .getPauseBetweenBatchesMs();
        int processed = 0;
        int consecutiveFailures = 0;

        try (java.nio.file.DirectoryStream<Path> stream = Files.newDirectoryStream(directory)) {
            for (Path path : stream) {
                try {
                    String fileName = path.getFileName().toString();

                    if (SHOULD_SKIP.test(fileName)) {
                        continue;
                    }

                    if (Files.isDirectory(path)) {
                        subdirectories.add(path);
                        continue;
                    }

                    if (registry.contains(path.toFile())) {
                        continue;
                    }

                    if (shouldDeleteFile(path, fileName, containerMode, maxAgeMillis)) {
                        try {
                            Files.deleteIfExists(path);
                            onDeleteCallback.accept(path);
                            consecutiveFailures = 0; // Reset failure count on success
                        } catch (IOException e) {
                            consecutiveFailures++;
                            if (e.getMessage() != null
                                    && e.getMessage().contains("being used by another process")) {
                                log.debug("File locked, skipping delete: {}", path);
                            } else {
                                log.warn("Failed to delete temp file: {}", path, e);
                            }

                            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                                log.error(
                                        "Aborting directory cleanup after {} consecutive failures in: {}",
                                        consecutiveFailures,
                                        directory);
                                return; // Early exit from cleanup
                            }
                        }
                    }
                } catch (Exception e) {
                    consecutiveFailures++;
                    log.warn("Error processing path: {}", path, e);

                    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                        log.error(
                                "Aborting directory cleanup after {} consecutive failures in: {}",
                                consecutiveFailures,
                                directory);
                        return; // Early exit from cleanup
                    }
                }

                processed++;
                if (batchSize > 0 && processed >= batchSize) {
                    if (pauseMs > 0) {
                        try {
                            Thread.sleep(pauseMs);
                        } catch (InterruptedException ie) {
                            Thread.currentThread().interrupt();
                        }
                    }
                    processed = 0;
                }
            }
        }

        for (Path subdirectory : subdirectories) {
            try {
                cleanupDirectoryStreaming(
                        subdirectory,
                        containerMode,
                        depth + 1,
                        maxAgeMillis,
                        isScheduled,
                        onDeleteCallback);
            } catch (IOException e) {
                log.warn("Error processing subdirectory: {}", subdirectory, e);
            }
        }
    }

    /** Determine if a file should be deleted based on its name, age, and other criteria. */
    private boolean shouldDeleteFile(
            Path path, String fileName, boolean containerMode, long maxAgeMillis) {
        // First check if it matches our known temp file patterns
        boolean isOurTempFile = IS_OUR_TEMP_FILE.test(fileName);
        boolean isSystemTempFile = IS_SYSTEM_TEMP_FILE.test(fileName);

        // Normal operation - check against temp file patterns
        boolean shouldDelete = isOurTempFile || (containerMode && isSystemTempFile);

        // Get file info for age checks
        long lastModified = 0;
        long currentTime = System.currentTimeMillis();
        boolean isEmptyFile = false;

        try {
            lastModified = Files.getLastModifiedTime(path).toMillis();
            // Special case for zero-byte files - these are often corrupted temp files
            if (Files.size(path) == 0) {
                isEmptyFile = true;
                // For empty files, use a shorter timeout (5 minutes)
                // Delete empty files older than 5 minutes
                if ((currentTime - lastModified) > 5 * 60 * 1000) {
                    shouldDelete = true;
                }
            }
        } catch (IOException e) {
            log.debug("Could not check file info, skipping: {}", path);
        }

        // Check file age against maxAgeMillis only if it's not an empty file that we've already
        // decided to delete
        if (!isEmptyFile && shouldDelete && maxAgeMillis > 0) {
            // In normal mode, check age against maxAgeMillis
            shouldDelete = (currentTime - lastModified) > maxAgeMillis;
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
                            path -> log.debug("Cleaned up LibreOffice temp file: {}", path));
                    log.debug("Cleaned up LibreOffice temp directory contents: {}", dir);
                }
            }
        } catch (IOException e) {
            log.warn("Failed to clean up LibreOffice temp files", e);
        }
    }

    /**
     * Clean up PDFBox cache file from user home directory. This cache file can grow large and
     * should be periodically cleaned.
     */
    private void cleanupPDFBoxCache() {
        try {
            Path userHome = Path.of(System.getProperty("user.home"));
            Path pdfboxCache = userHome.resolve(".pdfbox.cache");

            if (Files.exists(pdfboxCache)) {
                Files.deleteIfExists(pdfboxCache);
                log.debug("Cleaned up PDFBox cache file: {}", pdfboxCache);
            }
        } catch (IOException e) {
            log.warn("Failed to clean up PDFBox cache file", e);
        }
    }

    /** Get cleanup status and metrics for monitoring */
    public String getCleanupStatus() {
        if (cleanupRunning.get()) {
            long runningTime = System.currentTimeMillis() - lastCleanupTimestamp.get();
            return String.format("Running for %dms (cleanup #%d)", runningTime, cleanupCount.get());
        } else {
            long lastDuration = lastCleanupDuration.get();
            long lastTime = lastCleanupTimestamp.get();
            if (lastTime > 0) {
                long timeSinceLastRun = System.currentTimeMillis() - lastTime;
                return String.format(
                        "Last cleanup #%d: %dms duration, %dms ago",
                        cleanupCount.get(), lastDuration, timeSinceLastRun);
            } else {
                return "No cleanup runs yet";
            }
        }
    }

    /** Check if cleanup is currently running */
    public boolean isCleanupRunning() {
        return cleanupRunning.get();
    }

    /** Get cleanup metrics */
    public CleanupMetrics getMetrics() {
        return new CleanupMetrics(
                cleanupCount.get(),
                lastCleanupDuration.get(),
                lastCleanupTimestamp.get(),
                cleanupRunning.get());
    }

    /** Simple record for cleanup metrics */
    public record CleanupMetrics(
            long totalRuns, long lastDurationMs, long lastRunTimestamp, boolean currentlyRunning) {}
}
