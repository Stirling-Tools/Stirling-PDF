package stirling.software.common.util;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.Collections;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.stream.Collectors;

import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

/**
 * Central registry for tracking temporary files created by Stirling-PDF. Maintains a thread-safe
 * collection of paths with their creation timestamps.
 */
@Slf4j
@Component
public class TempFileRegistry {

    private final ConcurrentMap<Path, Instant> registeredFiles = new ConcurrentHashMap<>();
    private final Set<Path> thirdPartyTempFiles =
            Collections.newSetFromMap(new ConcurrentHashMap<>());
    private final Set<Path> tempDirectories = Collections.newSetFromMap(new ConcurrentHashMap<>());

    /**
     * Register a temporary file with the registry.
     *
     * @param file The temporary file to track
     * @return The same file for method chaining
     */
    public File register(File file) {
        if (file != null) {
            registeredFiles.put(file.toPath(), Instant.now());
            log.debug("Registered temp file: {}", file.getAbsolutePath());
        }
        return file;
    }

    /**
     * Register a temporary path with the registry.
     *
     * @param path The temporary path to track
     * @return The same path for method chaining
     */
    public Path register(Path path) {
        if (path != null) {
            registeredFiles.put(path, Instant.now());
            log.debug("Registered temp path: {}", path.toString());
        }
        return path;
    }

    /**
     * Register a temporary directory to be cleaned up.
     *
     * @param directory Directory to register
     * @return The same directory for method chaining
     */
    public Path registerDirectory(Path directory) {
        if (directory != null && Files.isDirectory(directory)) {
            tempDirectories.add(directory);
            log.debug("Registered temp directory: {}", directory.toString());
        }
        return directory;
    }

    /**
     * Register a third-party temporary file that requires special handling.
     *
     * @param file The third-party temp file
     * @return The same file for method chaining
     */
    public File registerThirdParty(File file) {
        if (file != null) {
            thirdPartyTempFiles.add(file.toPath());
            log.debug("Registered third-party temp file: {}", file.getAbsolutePath());
        }
        return file;
    }

    /**
     * Unregister a file from the registry.
     *
     * @param file The file to unregister
     */
    public void unregister(File file) {
        if (file != null) {
            registeredFiles.remove(file.toPath());
            thirdPartyTempFiles.remove(file.toPath());
            log.debug("Unregistered temp file: {}", file.getAbsolutePath());
        }
    }

    /**
     * Unregister a path from the registry.
     *
     * @param path The path to unregister
     */
    public void unregister(Path path) {
        if (path != null) {
            registeredFiles.remove(path);
            thirdPartyTempFiles.remove(path);
            log.debug("Unregistered temp path: {}", path.toString());
        }
    }

    /**
     * Get all registered temporary files.
     *
     * @return Set of registered file paths
     */
    public Set<Path> getAllRegisteredFiles() {
        return registeredFiles.keySet();
    }

    /**
     * Get temporary files older than the specified duration in milliseconds.
     *
     * @param maxAgeMillis Maximum age in milliseconds
     * @return Set of paths older than the specified age
     */
    public Set<Path> getFilesOlderThan(long maxAgeMillis) {
        Instant cutoffTime = Instant.now().minusMillis(maxAgeMillis);
        return registeredFiles.entrySet().stream()
                .filter(entry -> entry.getValue().isBefore(cutoffTime))
                .map(Map.Entry::getKey)
                .collect(Collectors.toSet());
    }

    /**
     * Get all registered third-party temporary files.
     *
     * @return Set of third-party file paths
     */
    public Set<Path> getThirdPartyTempFiles() {
        return thirdPartyTempFiles;
    }

    /**
     * Get all registered temporary directories.
     *
     * @return Set of temporary directory paths
     */
    public Set<Path> getTempDirectories() {
        return tempDirectories;
    }

    /**
     * Check if a file is registered in the registry.
     *
     * @param file The file to check
     * @return True if the file is registered, false otherwise
     */
    public boolean contains(File file) {
        if (file == null) {
            return false;
        }
        Path path = file.toPath();
        return registeredFiles.containsKey(path) || thirdPartyTempFiles.contains(path);
    }

    /** Clear all registry data. */
    public void clear() {
        registeredFiles.clear();
        thirdPartyTempFiles.clear();
        tempDirectories.clear();
    }
}
