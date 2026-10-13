package stirling.software.common.service;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.InvalidPathException;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import java.util.function.Predicate;
import java.util.stream.Stream;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.RegexPatternUtils;
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

    // A JPDFium dir younger than this may belong to a JVM that is still starting
    private static final long JPDFIUM_DIR_GRACE_MILLIS = 60 * 60 * 1000;

    // Names of the jpdfium bridge library across platforms; every extraction dir holds one
    private static final Set<String> JPDFIUM_BRIDGE_FILES =
            Set.of("jpdfium.dll", "libjpdfium.dylib", "libjpdfium.so");

    // Held by the owning JVM for its lifetime in fallback extraction dirs
    private static final String JPDFIUM_LOCK_FILE = ".lock";
    private static final String JPDFIUM_DIR_PREFIX = "jpdfium-";

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
                    RegexPatternUtils.getInstance()
                                    .getSystemTempFile1Pattern()
                                    .matcher(fileName)
                                    .matches()
                            || RegexPatternUtils.getInstance()
                                    .getSystemTempFile2Pattern()
                                    .matcher(fileName)
                                    .matches()
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
    @Scheduled(
            fixedDelayString =
                    "#{applicationProperties.system.tempFileManagement.cleanupIntervalMinutes}",
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
                if (Files.exists(directory)
                        && shouldDeleteRegisteredDirectory(directory, maxAgeMillis)) {
                    GeneralUtils.deleteDirectory(directory);
                    registry.unregisterDirectory(directory);
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
        totalDeletedCount += cleanupStaleJpdfiumDirs();
        log.info(
                "Startup cleanup complete. Deleted {} temporary files/directories",
                totalDeletedCount);
    }

    /**
     * Removes JPDFium extraction dirs leaked by older versions on Windows. The age gate keeps a dir
     * whose JVM may still be extracting, the content check keeps the sweep away from a same-named
     * dir this application did not create, and the lock check keeps a running JVM's fallback dir:
     * JPDFium holds {@code .lock} there for its lifetime.
     *
     * @return number of directories removed
     */
    private int cleanupStaleJpdfiumDirs() {
        int deletedCount = 0;
        for (Path root : jpdfiumScanRoots()) {
            if (!Files.isDirectory(root)) continue;
            List<Path> stale;
            try (Stream<Path> entries = Files.list(root)) {
                stale =
                        entries.filter(p -> Files.isDirectory(p, LinkOption.NOFOLLOW_LINKS))
                                .filter(
                                        p ->
                                                p.getFileName()
                                                        .toString()
                                                        .startsWith(JPDFIUM_DIR_PREFIX))
                                .filter(p -> isOlderThan(p, JPDFIUM_DIR_GRACE_MILLIS))
                                .filter(TempFileCleanupService::looksLikeJpdfiumExtraction)
                                .filter(dir -> !isJpdfiumDirInUse(dir))
                                .toList();
            } catch (IOException | UncheckedIOException e) {
                log.debug("JPDFium temp scan failed for {}: {}", root, e.getMessage());
                continue;
            }
            for (Path dir : stale) {
                try {
                    GeneralUtils.deleteDirectory(dir);
                    deletedCount++;
                    log.info("Removed stale JPDFium extraction dir: {}", dir);
                } catch (IOException e) {
                    // Windows keeps loaded DLLs locked; a later startup retries.
                    log.debug("Could not remove JPDFium dir {}: {}", dir, e.getMessage());
                }
            }
        }
        return deletedCount;
    }

    /**
     * JPDFium extracts into {@code java.io.tmpdir}; the configured system and base temp dirs
     * receive the dirs only when the JVM temp dir points at them, so all three are scanned and
     * deduplicated. An unusable configured path is skipped instead of aborting startup.
     */
    private Path[] jpdfiumScanRoots() {
        List<Path> roots = new ArrayList<>(3);
        addJpdfiumScanRoot(roots, System.getProperty("java.io.tmpdir"));
        ApplicationProperties.TempFileManagement tempFiles =
                applicationProperties.getSystem().getTempFileManagement();
        addJpdfiumScanRoot(roots, tempFiles.getSystemTempDir());
        addJpdfiumScanRoot(roots, tempFiles.getBaseTmpDir());
        return roots.toArray(Path[]::new);
    }

    private static void addJpdfiumScanRoot(List<Path> roots, String rawPath) {
        if (rawPath == null || rawPath.isBlank()) return;
        try {
            Path root = Path.of(rawPath);
            if (!roots.contains(root)) {
                roots.add(root);
            }
        } catch (InvalidPathException e) {
            log.debug("Skipping invalid temp scan root '{}': {}", rawPath, e.getMessage());
        }
    }

    /**
     * Every extraction dir holds the jpdfium bridge next to pdfium itself; requiring that exact
     * artifact keeps the sweep from deleting an unrelated dir that happens to share the prefix.
     */
    private static boolean looksLikeJpdfiumExtraction(Path dir) {
        try (Stream<Path> entries = Files.list(dir)) {
            return entries.map(path -> path.getFileName().toString().toLowerCase(Locale.ROOT))
                    .anyMatch(JPDFIUM_BRIDGE_FILES::contains);
        } catch (IOException | UncheckedIOException e) {
            return false;
        }
    }

    /**
     * A fallback extraction dir holds a {@code .lock} the owning JVM keeps locked for its whole
     * lifetime; a free or absent lock means the dir is a leftover. Anything unreadable counts as in
     * use so cleanup fails closed.
     */
    private static boolean isJpdfiumDirInUse(Path dir) {
        Path lockFile = dir.resolve(JPDFIUM_LOCK_FILE);
        if (!Files.exists(lockFile, LinkOption.NOFOLLOW_LINKS)) return false;
        try (FileChannel channel =
                        FileChannel.open(
                                lockFile, StandardOpenOption.READ, StandardOpenOption.WRITE);
                FileLock lock = channel.tryLock()) {
            return lock == null;
        } catch (IOException | RuntimeException e) {
            return true;
        }
    }

    private static boolean isOlderThan(Path path, long ageMillis) {
        try {
            return System.currentTimeMillis() - Files.getLastModifiedTime(path).toMillis()
                    > ageMillis;
        } catch (IOException e) {
            return false;
        }
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

    private boolean shouldDeleteRegisteredDirectory(Path directory, long maxAgeMillis) {
        if (maxAgeMillis <= 0) {
            return true;
        }

        try {
            long currentTime = System.currentTimeMillis();
            long lastModified = Files.getLastModifiedTime(directory).toMillis();
            return (currentTime - lastModified) > maxAgeMillis;
        } catch (IOException e) {
            log.debug("Could not check directory age, skipping cleanup: {}", directory, e);
            return false;
        }
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

        try (Stream<Path> pathStream = Files.list(directory)) {
            pathStream.forEach(
                    path -> {
                        try {
                            String fileName = path.getFileName().toString();

                            if (SHOULD_SKIP.test(fileName)) {
                                return;
                            }

                            if (Files.isDirectory(path)) {
                                if (fileName.startsWith(JPDFIUM_DIR_PREFIX)) {
                                    // The lock-aware sweep owns these; unlinking a
                                    // live .lock would hide it from that sweep.
                                    return;
                                }
                                subdirectories.add(path);
                                return;
                            }

                            if (registry.contains(path.toFile())) {
                                return;
                            }

                            if (shouldDeleteFile(path, fileName, containerMode, maxAgeMillis)) {
                                try {
                                    Files.deleteIfExists(path);
                                    onDeleteCallback.accept(path);
                                } catch (IOException e) {
                                    if (e.getMessage() != null
                                            && e.getMessage()
                                                    .contains("being used by another process")) {
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
}
