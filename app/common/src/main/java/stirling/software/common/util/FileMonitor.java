package stirling.software.common.util;

import static java.nio.file.StandardWatchEventKinds.*;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
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
    private final Map<Path, Object> rootFileKeys;
    private final Set<Path> newlyDiscoveredFiles;
    private final ConcurrentHashMap.KeySetView<Path, Boolean> readyForProcessingFiles;
    private final WatchService watchService;
    private final Predicate<Path> pathFilter;
    private final List<Path> rootDirs;
    private Set<Path> stagingFiles;
    private boolean missingRootWarningLogged;

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
        this.rootFileKeys = new HashMap<>();
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
                        rememberRoot(rootDir);
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

    private static Object fileKey(Path path) {
        try {
            return Files.readAttributes(path, BasicFileAttributes.class).fileKey();
        } catch (IOException e) {
            return null;
        }
    }

    private void rememberRoot(Path root) {
        Object key = fileKey(root);
        if (key != null) {
            rootFileKeys.put(root, key);
        }
    }

    /**
     * A root can be deleted and recreated between ticks. The old {@link WatchKey} then points at a
     * path that exists again but is no longer watched, so {@code key.reset()} can stay true. Drop
     * the stale subtree and let the normal re-registration path walk it again.
     */
    private void forgetReplacedRoots() {
        for (Path root : rootDirs) {
            Object previous = rootFileKeys.get(root);
            if (previous == null) {
                continue;
            }
            boolean exists = Files.exists(root);
            Object current = exists ? fileKey(root) : null;
            if (exists && (current == null || current.equals(previous))) {
                continue;
            }
            path2KeyMapping
                    .entrySet()
                    .removeIf(
                            entry -> {
                                if (!entry.getKey().equals(root)
                                        && !entry.getKey().startsWith(root)) {
                                    return false;
                                }
                                entry.getValue().cancel();
                                return true;
                            });
            rootFileKeys.keySet().removeIf(key -> key.equals(root) || key.startsWith(root));
        }
    }

    @Scheduled(fixedRate = 5000)
    public void trackFiles() {
        /*
         All files observed changes in the last iteration will be considered as staging files.
         If those files are not modified in current iteration, they will be considered as ready for processing.
        */

        forgetReplacedRoots();

        if (path2KeyMapping.isEmpty()) {
            if (rootDirs.isEmpty()) {
                return;
            }

            // A configured root that does not exist yet can appear later, so
            // keep checking every tick without repeating the warning. Pending
            // work stays queued until a root is watchable again.
            if (rootDirs.stream().noneMatch(Files::exists)) {
                if (!missingRootWarningLogged) {
                    log.warn(
                            "Not monitoring any directories; waiting for a configured root to"
                                    + " appear.");
                    missingRootWarningLogged = true;
                }
                return;
            }

            if (!missingRootWarningLogged) {
                log.warn("Not monitoring any directories; attempting to re-register root paths.");
            }
            missingRootWarningLogged = true;
            for (Path rootDir : rootDirs) {
                if (Files.exists(
                        rootDir)) { // if the root directory exists, re-register the root directory
                    try {
                        recursivelyRegisterEntry(rootDir);
                        rememberRoot(rootDir);
                    } catch (IOException e) {
                        log.error("unable to register monitoring for {}", rootDir, e);
                    }
                }
            }
            if (!path2KeyMapping.isEmpty()) {
                missingRootWarningLogged = false;
            }
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
                Path watched = (Path) key.watchable();
                path2KeyMapping.remove(watched);
                rootFileKeys.remove(watched);
            }
            key = watchService.poll();
        }
        readyForProcessingFiles.addAll(stagingFiles);
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
