package stirling.software.common.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.concurrent.TimeUnit;
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

        int unregisteredDeletedCount = 0;
        try {
            // Get all directories we need to clean
            Path systemTempPath;
            if (systemTempDir != null && !systemTempDir.isEmpty()) {
                systemTempPath = Path.of(systemTempDir);
            } else {
                systemTempPath = Path.of(System.getProperty("java.io.tmpdir"));
            }

            Path[] dirsToScan = {
                systemTempPath, Path.of(customTempDirectory), Path.of(libreOfficeTempDir)
            };

            boolean containerMode =
                    "Docker".equals(machineType) || "Kubernetes".equals(machineType);

            // Process each directory
            for (Path tempDir : dirsToScan) {
                if (!Files.exists(tempDir)) {
                    continue;
                }

                int dirDeletedCount = cleanupDirectory(tempDir, containerMode, 0, maxAgeMillis);
                unregisteredDeletedCount += dirDeletedCount;
                if (dirDeletedCount > 0) {
                    log.info(
                            "Cleaned up {} unregistered files/directories in {}",
                            dirDeletedCount,
                            tempDir);
                }
            }
        } catch (IOException e) {
            log.error("Error during scheduled cleanup of unregistered files", e);
        }

        log.info(
                "Scheduled cleanup complete. Deleted {} registered files, {} unregistered files, {} directories",
                registeredDeletedCount,
                unregisteredDeletedCount,
                directoriesDeletedCount);
    }

    /** Overload of cleanupDirectory that uses the specified max age for files */
    private int cleanupDirectory(
            Path directory, boolean containerMode, int depth, long maxAgeMillis)
            throws IOException {
        if (depth > 5) {
            log.warn("Maximum directory recursion depth reached for: {}", directory);
            return 0;
        }

        int deletedCount = 0;

        try (Stream<Path> paths = Files.list(directory)) {
            for (Path path : paths.toList()) {
                String fileName = path.getFileName().toString();

                // Skip registered files - these are handled by TempFileManager
                if (registry.contains(path.toFile())) {
                    continue;
                }

                // Skip Jetty-related directories and files
                if (fileName.contains("jetty") || fileName.startsWith("jetty-")) {
                    continue;
                }

                // Check if this is a directory we should recursively scan
                if (Files.isDirectory(path)) {
                    // Don't recurse into certain system directories
                    if (!"proc".equals(fileName)
                            && !"sys".equals(fileName)
                            && !"dev".equals(fileName)) {
                        deletedCount +=
                                cleanupDirectory(path, containerMode, depth + 1, maxAgeMillis);
                    }
                    continue;
                }

                // Determine if this file matches our temp file patterns
                boolean isOurTempFile =
                        fileName.startsWith("stirling-pdf-")
                                || fileName.startsWith("output_")
                                || fileName.startsWith("compressedPDF")
                                || fileName.startsWith("pdf-save-")
                                || fileName.startsWith("pdf-stream-")
                                || fileName.startsWith("PDFBox")
                                || fileName.startsWith("input_")
                                || fileName.startsWith("overlay-");

                // Avoid touching Jetty files
                boolean isSystemTempFile =
                        fileName.matches("lu\\d+[a-z0-9]*\\.tmp")
                                || fileName.matches("ocr_process\\d+")
                                || (fileName.startsWith("tmp") && !fileName.contains("jetty"))
                                || fileName.startsWith("OSL_PIPE_")
                                || (fileName.endsWith(".tmp") && !fileName.contains("jetty"));

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
                if (shouldDelete) {
                    try {
                        long lastModified = Files.getLastModifiedTime(path).toMillis();
                        long currentTime = System.currentTimeMillis();
                        shouldDelete = (currentTime - lastModified) > maxAgeMillis;
                    } catch (IOException e) {
                        log.debug("Could not check file age, skipping: {}", path);
                        shouldDelete = false;
                    }
                }

                if (shouldDelete) {
                    try {
                        Files.deleteIfExists(path);
                        deletedCount++;
                        log.debug(
                                "Deleted unregistered temp file during scheduled cleanup: {}",
                                path);
                    } catch (IOException e) {
                        // Handle locked files more gracefully - just log at debug level
                        if (e.getMessage() != null
                                && e.getMessage().contains("being used by another process")) {
                            log.debug("File locked, skipping delete: {}", path);
                        } else {
                            log.warn(
                                    "Failed to delete temp file during scheduled cleanup: {}",
                                    path,
                                    e);
                        }
                    }
                }
            }
        }

        return deletedCount;
    }

    /**
     * Perform startup cleanup of stale temporary files from previous runs. This is especially
     * important in Docker environments where temp files persist between container restarts.
     */
    private void runStartupCleanup() {
        log.info("Running startup temporary file cleanup");

        try {
            // Get all directories we need to clean
            Path systemTempPath;
            if (systemTempDir != null && !systemTempDir.isEmpty()) {
                systemTempPath = Path.of(systemTempDir);
            } else {
                systemTempPath = Path.of(System.getProperty("java.io.tmpdir"));
            }

            Path[] dirsToScan = {
                systemTempPath, Path.of(customTempDirectory), Path.of(libreOfficeTempDir)
            };

            int totalDeletedCount = 0;

            boolean containerMode =
                    "Docker".equals(machineType) || "Kubernetes".equals(machineType);
            log.info(
                    "Running in {} mode, using {} cleanup strategy",
                    machineType,
                    containerMode ? "aggressive" : "conservative");

            // Process each directory
            for (Path tempDir : dirsToScan) {
                if (!Files.exists(tempDir)) {
                    log.warn("Temporary directory does not exist: {}", tempDir);
                    continue;
                }

                log.info("Scanning directory for cleanup: {}", tempDir);
                int dirDeletedCount = cleanupDirectory(tempDir, containerMode, 0);
                totalDeletedCount += dirDeletedCount;
                log.info("Cleaned up {} files/directories in {}", dirDeletedCount, tempDir);
            }

            log.info(
                    "Startup cleanup complete. Deleted {} temporary files/directories",
                    totalDeletedCount);
        } catch (IOException e) {
            log.error("Error during startup cleanup", e);
        }
    }

    /**
     * Recursively clean up a directory for temporary files.
     *
     * @param directory The directory to clean
     * @param containerMode Whether we're in container mode (more aggressive cleanup)
     * @param depth Current recursion depth (to prevent excessive recursion)
     * @return Number of files deleted
     */
    private int cleanupDirectory(Path directory, boolean containerMode, int depth)
            throws IOException {
        if (depth > 5) {
            log.warn("Maximum directory recursion depth reached for: {}", directory);
            return 0;
        }

        int deletedCount = 0;

        try (Stream<Path> paths = Files.list(directory)) {
            for (Path path : paths.toList()) {
                String fileName = path.getFileName().toString();

                // Skip Jetty-related directories and files
                if (fileName.contains("jetty") || fileName.startsWith("jetty-")) {
                    continue;
                }

                // Check if this is a directory we should recursively scan
                if (Files.isDirectory(path)) {
                    // Don't recurse into certain system directories
                    if (!"proc".equals(fileName)
                            && !"sys".equals(fileName)
                            && !"dev".equals(fileName)) {
                        deletedCount += cleanupDirectory(path, containerMode, depth + 1);
                    }
                    continue;
                }

                // Determine if this file matches our temp file patterns
                boolean isOurTempFile =
                        fileName.startsWith("stirling-pdf-")
                                || fileName.startsWith("output_")
                                || fileName.startsWith("compressedPDF")
                                || fileName.startsWith("pdf-save-")
                                || fileName.startsWith("pdf-stream-")
                                || fileName.startsWith("PDFBox")
                                || fileName.startsWith("input_")
                                || fileName.startsWith("overlay-");

                // Avoid touching Jetty files
                boolean isSystemTempFile =
                        fileName.matches("lu\\d+[a-z0-9]*\\.tmp")
                                || fileName.matches("ocr_process\\d+")
                                || (fileName.startsWith("tmp") && !fileName.contains("jetty"))
                                || fileName.startsWith("OSL_PIPE_")
                                || (fileName.endsWith(".tmp") && !fileName.contains("jetty"));

                boolean shouldDelete = isOurTempFile || (containerMode && isSystemTempFile);

                // Special case for zero-byte files - these are often corrupted temp files
                boolean isEmptyFile = false;
                try {
                    if (!Files.isDirectory(path) && Files.size(path) == 0) {
                        isEmptyFile = true;
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

                // For non-container mode, check file age before deleting
                if (!containerMode && (isOurTempFile || isSystemTempFile) && !isEmptyFile) {
                    try {
                        long lastModified = Files.getLastModifiedTime(path).toMillis();
                        long currentTime = System.currentTimeMillis();
                        // Only delete files older than 24 hours in non-container mode
                        shouldDelete = (currentTime - lastModified) > 24 * 60 * 60 * 1000;
                    } catch (IOException e) {
                        log.debug("Could not check file age, skipping: {}", path);
                        shouldDelete = false;
                    }
                }

                if (shouldDelete) {
                    try {
                        if (Files.isDirectory(path)) {
                            GeneralUtils.deleteDirectory(path);
                        } else {
                            Files.deleteIfExists(path);
                        }
                        deletedCount++;
                        log.debug("Deleted temp file during startup cleanup: {}", path);
                    } catch (IOException e) {
                        log.warn("Failed to delete temp file during startup cleanup: {}", path, e);
                    }
                }
            }
        }

        return deletedCount;
    }

    /** Clean up LibreOffice temporary files. This method is called after LibreOffice operations. */
    public void cleanupLibreOfficeTempFiles() {
        // Cleanup known LibreOffice temp directories
        try {
            Set<Path> directories = registry.getTempDirectories();
            for (Path dir : directories) {
                if (dir.getFileName().toString().contains("libreoffice")) {
                    // For directories containing "libreoffice", delete all contents
                    // but keep the directory itself for future use
                    try (Stream<Path> files = Files.list(dir)) {
                        for (Path file : files.toList()) {
                            if (Files.isDirectory(file)) {
                                GeneralUtils.deleteDirectory(file);
                            } else {
                                Files.deleteIfExists(file);
                            }
                        }
                    }
                    log.debug("Cleaned up LibreOffice temp directory contents: {}", dir);
                }
            }
        } catch (IOException e) {
            log.warn("Failed to clean up LibreOffice temp files", e);
        }
    }
}
