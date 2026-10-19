package stirling.software.common.util;

import static java.nio.file.StandardWatchEventKinds.*;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Predicate;
import java.util.stream.Stream;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.RuntimePathConfig;

@Component
@Slf4j
public class FileMonitor {

    private final Map<Path, WatchKey> path2KeyMapping;
    private final Set<Path> newlyDiscoveredFiles;
    private final ConcurrentHashMap.KeySetView<Path, Boolean> readyForProcessingFiles;
    private final WatchService watchService;
    private final Predicate<Path> pathFilter;
    private final List<Path> rootDirs;
    private Set<Path> stagingFiles;

    private static final long RE_REGISTER_INTERVAL_MS = 60_000;
    private volatile long nextRegistrationAttemptMs;
    private volatile boolean missingRootsWarned;

    /**
     * @param rootDirectory the root directory to monitor
     * @param pathFilter the filter to apply to the paths, return true if the path should be
     *     monitored, false otherwise
     */
    public FileMonitor(
            @Qualifier("directoryFilter") Predicate<Path> pathFilter,
            RuntimePathConfig runtimePathConfig)
            throws IOException {
        this.newlyDiscoveredFiles = new HashSet<>();
        this.path2KeyMapping = new HashMap<>();
        this.stagingFiles = new HashSet<>();
        this.pathFilter = pathFilter;
        this.readyForProcessingFiles = ConcurrentHashMap.newKeySet();
        this.watchService = FileSystems.getDefault().newWatchService();

        List<String> watchedFoldersDirs = runtimePathConfig.getPipelineWatchedFoldersPaths();
        List<Path> validRootDirs = new ArrayList<>();

        for (String pathStr : watchedFoldersDirs) {
            try {
                Path path = Path.of(pathStr);
                validRootDirs.add(path);
                log.info("Monitoring directory: {}", path);
            } catch (Exception e) {
                log.error(
                        "Failed to initialize monitoring for path '{}': {}",
                        pathStr,
                        e.getMessage());
            }
        }

        this.rootDirs = Collections.unmodifiableList(validRootDirs);

        if (this.rootDirs.isEmpty()) {
            log.error("No valid directories to monitor - FileMonitor will not function");
        } else {
            // Register directories eagerly so the first @Scheduled tick does not warn.
            for (Path rootDir : this.rootDirs) {
                if (Files.exists(rootDir)) {
                    try {
                        recursivelyRegisterEntry(rootDir);
                    } catch (IOException e) {
                        log.error("Failed to register monitoring for {}", rootDir, e);
                    }
                }
            }
        }
    }

    private boolean shouldNotProcess(Path path) {
        return !pathFilter.test(path);
    }

    private void recursivelyRegisterEntry(Path dir) throws IOException {
        WatchKey key = dir.register(watchService, ENTRY_CREATE, ENTRY_DELETE, ENTRY_MODIFY);
        path2KeyMapping.put(dir, key);
        log.info("Registered directory: {}", dir);

        try (Stream<Path> directoryVisitor = Files.walk(dir, 1)) {
            final Iterator<Path> iterator = directoryVisitor.iterator();
            while (iterator.hasNext()) {
                Path path = iterator.next();
                if (path.equals(dir) || shouldNotProcess(path)) continue;

                if (Files.isDirectory(path)) {
                    recursivelyRegisterEntry(path);
                } else if (Files.isRegularFile(path)) {
                    handleFileCreation(path);
                }
            }
        }
    }

    @Scheduled(fixedRate = 5000)
    public void trackFiles() {
        /*
         All files observed changes in the last iteration will be considered as staging files.
         If those files are not modified in current iteration, they will be considered as ready for processing.
        */

        if (path2KeyMapping.isEmpty()) {
            retryMissingRoots();
            return;
        }

        // Skip expensive collection work when there is nothing to track
        WatchKey firstKey = watchService.poll();
        if (firstKey == null
                && newlyDiscoveredFiles.isEmpty()
                && readyForProcessingFiles.isEmpty()) {
            return;
        }

        stagingFiles = new HashSet<>(newlyDiscoveredFiles);
        readyForProcessingFiles.clear();

        WatchKey key = firstKey;
        while (key != null) {
            final Path watchingDir = (Path) key.watchable();
            key.pollEvents()
                    .forEach(
                            (evt) -> {
                                final Path path = (Path) evt.context();
                                final WatchEvent.Kind<?> kind = evt.kind();
                                if (shouldNotProcess(path)) return;

                                try {
                                    if (Files.isDirectory(path)) {
                                        if (kind == ENTRY_CREATE) {
                                            handleDirectoryCreation(path);
                                        }
                                        /*
                                         we don't need to handle directory deletion or modification
                                         - directory deletion will be handled by key.reset()
                                         - directory modification indicates a new file creation or deletion, which is handled by below
                                        */
                                    }
                                    Path relativePathFromRoot = watchingDir.resolve(path);
                                    if (kind == ENTRY_CREATE) {
                                        handleFileCreation(relativePathFromRoot);
                                    } else if (kind == ENTRY_DELETE) {
                                        handleFileRemoval(relativePathFromRoot);
                                    } else if (kind == ENTRY_MODIFY) {
                                        handleFileModification(relativePathFromRoot);
                                    }
                                } catch (Exception e) {
                                    log.error("Error while processing file: {}", path, e);
                                }
                            });

            boolean isKeyValid = key.reset();
            if (!isKeyValid) { // key is invalid when the directory itself is no longer exists
                path2KeyMapping.remove((Path) key.watchable());
            }
            key = watchService.poll();
        }
        readyForProcessingFiles.addAll(stagingFiles);
    }

    /**
     * Re-attempts registration of configured roots that were absent at startup. Runs at most once a
     * minute, so a not-yet-mounted folder does not turn the five-second tick into a filesystem
     * scan; an unconfigured monitor is silent because the constructor already reports it.
     */
    private void retryMissingRoots() {
        if (rootDirs.isEmpty()) {
            return;
        }
        long now = System.currentTimeMillis();
        if (now < nextRegistrationAttemptMs) {
            return;
        }
        nextRegistrationAttemptMs = now + RE_REGISTER_INTERVAL_MS;

        boolean registered = false;
        for (Path rootDir : rootDirs) {
            if (!Files.exists(rootDir)) {
                continue;
            }
            try {
                recursivelyRegisterEntry(rootDir);
                registered = true;
            } catch (IOException e) {
                log.error("Failed to register monitoring for {}", rootDir, e);
            }
        }
        if (!registered && !missingRootsWarned) {
            missingRootsWarned = true;
            log.warn(
                    "Watched folders are not available yet; retrying registration every {}s: {}",
                    RE_REGISTER_INTERVAL_MS / 1000,
                    rootDirs);
        }
    }

    private void handleDirectoryCreation(Path dir) throws IOException {
        WatchKey key = dir.register(watchService, ENTRY_CREATE, ENTRY_DELETE, ENTRY_MODIFY);
        path2KeyMapping.put(dir, key);
    }

    private void handleFileRemoval(Path path) {
        newlyDiscoveredFiles.remove(path);
        stagingFiles.remove(path);
    }

    private void handleFileCreation(Path path) {
        newlyDiscoveredFiles.add(path);
        stagingFiles.remove(path);
    }

    private void handleFileModification(Path path) {
        // the logic is the same
        handleFileCreation(path);
    }

    /**
     * Check if the file is ready for processing.
     *
     * <p>A file is ready for processing if it is not being modified for 5000ms.
     *
     * @param path the path of the file
     * @return true if the file is ready for processing, false otherwise
     */
    public boolean isFileReadyForProcessing(Path path) {
        // 1. Check FileMonitor's ready list
        boolean isReady = readyForProcessingFiles.contains(path.toAbsolutePath());

        // 2. Check last modified timestamp
        if (!isReady) {
            try {
                long lastModified = Files.getLastModifiedTime(path).toMillis();
                long currentTime = System.currentTimeMillis();
                isReady = (currentTime - lastModified) > 5000;
            } catch (IOException e) {
                log.info("Timestamp check failed for {}", path, e);
            }
        }

        // 3. Direct file lock check
        if (isReady) {
            try (RandomAccessFile raf = new RandomAccessFile(path.toFile(), "rw");
                    FileChannel channel = raf.getChannel()) {
                // Try acquiring an exclusive lock
                FileLock lock = channel.tryLock();
                if (lock == null) {
                    isReady = false;
                } else {
                    lock.release();
                }
            } catch (IOException e) {
                log.info("File lock detected on {}", path);
                isReady = false;
            }
        }

        return isReady;
    }
}
