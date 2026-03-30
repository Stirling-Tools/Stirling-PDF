package stirling.software.common.util;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;

import org.springframework.stereotype.Component;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.AutoPipeline.FileReadiness;

/**
 * Stateless safety checker that decides whether a file is stable and ready for pipeline processing.
 * Call {@link #isReady(Path)} before moving or processing any file picked up from a watched folder.
 *
 * <p>A file is considered ready when ALL of the following hold:
 *
 * <ol>
 *   <li>The file exists on disk.
 *   <li>The path refers to a regular file, not a directory.
 *   <li>The file's extension matches the configured allow-list (if one is set).
 *   <li>The file has not been modified within the configured settle window ({@code
 *       settleTimeMillis}), meaning it is no longer being written.
 *   <li>The file size is stable: two reads separated by {@code sizeCheckDelayMillis} return the
 *       same value. This catches active copies on Linux/macOS where advisory file locking alone
 *       cannot detect a mid-copy file.
 *   <li>An exclusive file-system lock can be acquired, confirming no other process holds it.
 * </ol>
 *
 * <p>All behaviour is controlled through {@link FileReadiness} inside {@link
 * ApplicationProperties.AutoPipeline}. Setting {@code enabled: false} makes every call return
 * {@code true} so the checker is a no-op drop-in.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class FileReadinessChecker {

    private final ApplicationProperties applicationProperties;

    /**
     * Returns {@code true} when the file at {@code path} passes every readiness check and is safe
     * to hand off to the pipeline for processing. Returns {@code false} when any check fails; the
     * caller should skip the file and retry on the next scan cycle.
     */
    public boolean isReady(Path path) {
        FileReadiness config = applicationProperties.getAutoPipeline().getFileReadiness();

        if (!config.isEnabled()) {
            return true;
        }

        if (!existsAsRegularFile(path)) {
            return false;
        }

        if (!isExtensionAllowed(path, config.getAllowedExtensions())) {
            return false;
        }

        if (!hasSettled(path, config.getSettleTimeMillis())) {
            return false;
        }

        if (!hasSizeStabilized(path, config.getSizeCheckDelayMillis())) {
            return false;
        }

        if (isLocked(path)) {
            return false;
        }

        return true;
    }

    // -------------------------------------------------------------------------
    // Individual checks
    // -------------------------------------------------------------------------

    private boolean existsAsRegularFile(Path path) {
        if (!Files.exists(path)) {
            log.debug("File does not exist, skipping: {}", path);
            return false;
        }
        if (!Files.isRegularFile(path)) {
            log.debug("Path is not a regular file (directory or symlink?), skipping: {}", path);
            return false;
        }
        return true;
    }

    /**
     * Returns {@code true} when {@code allowedExtensions} is empty (no filter) or when the file's
     * extension (case-insensitive) appears in the list.
     */
    private boolean isExtensionAllowed(Path path, List<String> allowedExtensions) {
        if (allowedExtensions == null || allowedExtensions.isEmpty()) {
            return true;
        }
        String filename = path.getFileName().toString();
        String extension =
                filename.contains(".")
                        ? filename.substring(filename.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT)
                        : "";
        boolean allowed =
                allowedExtensions.stream().anyMatch(ext -> ext.equalsIgnoreCase(extension));
        if (!allowed) {
            log.debug(
                    "File '{}' has extension '{}' which is not in the allowed list {}, skipping",
                    filename,
                    extension,
                    allowedExtensions);
        }
        return allowed;
    }

    /**
     * Returns {@code true} when the file's last-modified timestamp is at least {@code
     * settleTimeMillis} milliseconds in the past, indicating the write has completed and the file
     * has "settled".
     */
    private boolean hasSettled(Path path, long settleTimeMillis) {
        try {
            long lastModified = Files.getLastModifiedTime(path).toMillis();
            long ageMillis = System.currentTimeMillis() - lastModified;
            boolean settled = ageMillis >= settleTimeMillis;
            if (!settled) {
                log.debug(
                        "File '{}' was modified {}ms ago (settle threshold: {}ms), not yet ready",
                        path.getFileName(),
                        ageMillis,
                        settleTimeMillis);
            }
            return settled;
        } catch (IOException e) {
            log.warn(
                    "Could not read last-modified time for '{}', treating as not settled: {}",
                    path,
                    e.getMessage());
            return false;
        }
    }

    /**
     * Returns {@code true} when the file size is the same before and after a short pause of {@code
     * sizeCheckDelayMillis} milliseconds. A size change indicates another process is still
     * appending to the file. This is the primary write-detection mechanism on Linux/macOS, where
     * mandatory file locking is not enforced by the OS.
     */
    private boolean hasSizeStabilized(Path path, long sizeCheckDelayMillis) {
        try {
            long sizeBefore = Files.size(path);
            Thread.sleep(sizeCheckDelayMillis);
            long sizeAfter = Files.size(path);
            boolean stable = sizeBefore == sizeAfter;
            if (!stable) {
                log.debug(
                        "File '{}' size changed from {} to {} bytes during stability check,"
                                + " not yet ready",
                        path.getFileName(),
                        sizeBefore,
                        sizeAfter);
            }
            return stable;
        } catch (IOException e) {
            log.warn(
                    "Could not read file size for '{}', treating as unstable: {}",
                    path,
                    e.getMessage());
            return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn(
                    "Size stability check interrupted for '{}', treating as unstable",
                    path.getFileName());
            return false;
        }
    }

    /**
     * Returns {@code true} when an exclusive file-system lock cannot be acquired, which indicates
     * another process still holds the file open for writing.
     *
     * <p>{@link OverlappingFileLockException} is also treated as locked: the JVM already holds a
     * lock on this file (e.g. from another thread), so it is unsafe to process.
     */
    private boolean isLocked(Path path) {
        try (RandomAccessFile raf = new RandomAccessFile(path.toFile(), "rw");
                FileChannel channel = raf.getChannel()) {
            FileLock lock = channel.tryLock();
            if (lock == null) {
                log.debug("File '{}' is locked by another process", path.getFileName());
                return true;
            }
            lock.release();
            return false;
        } catch (OverlappingFileLockException e) {
            log.debug("File '{}' is already locked by this JVM", path.getFileName());
            return true;
        } catch (IOException e) {
            log.debug(
                    "Could not acquire lock on '{}', treating as locked: {}",
                    path.getFileName(),
                    e.getMessage());
            return true;
        }
    }
}
