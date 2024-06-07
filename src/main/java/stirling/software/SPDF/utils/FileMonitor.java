package stirling.software.SPDF.utils;

import static java.nio.file.StandardWatchEventKinds.*;

import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Predicate;
import java.util.stream.Stream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class FileMonitor {
    private static final Logger logger = LoggerFactory.getLogger(FileMonitor.class);
    private final Map<Path, WatchKey> path2KeyMapping;
    private final Set<Path> newlyDiscoveredFiles;
    private final ConcurrentHashMap.KeySetView<Path, Boolean> readyForProcessingFiles;
    private final WatchService watchService;
    private final Predicate<Path> pathFilter;
    private final Path rootDir;
    private Set<Path> stagingFiles;

    /**
     * @param rootDirectory the root directory to monitor
     * @param pathFilter the filter to apply to the paths, return true if the path should be
     *     monitored, false otherwise
     */
    @Autowired
    public FileMonitor(
            @Qualifier("watchedFoldersDir") String rootDirectory,
            @Qualifier("directoryFilter") Predicate<Path> pathFilter)
            throws IOException {
        this.newlyDiscoveredFiles = new HashSet<>();
        this.path2KeyMapping = new HashMap<>();
        this.stagingFiles = new HashSet<>();
        this.pathFilter = pathFilter;
        this.readyForProcessingFiles = ConcurrentHashMap.newKeySet();
        this.watchService = FileSystems.getDefault().newWatchService();
        this.rootDir = Path.of(rootDirectory);
    }

    private boolean shouldNotProcess(Path path) {
        return !pathFilter.test(path);
    }

    private void recursivelyRegisterEntry(Path dir) throws IOException {
        WatchKey key = dir.register(watchService, ENTRY_CREATE, ENTRY_DELETE, ENTRY_MODIFY);
        path2KeyMapping.put(dir, key);
        logger.info("Registered directory: {}", dir);

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
        stagingFiles = new HashSet<>(newlyDiscoveredFiles);
        readyForProcessingFiles.clear();

        if (path2KeyMapping.isEmpty()) {
            logger.warn(
                    "not monitoring any directory, even the root directory itself: {}", rootDir);
            if (Files.exists(
                    rootDir)) { // if the root directory exists, re-register the root directory
                try {
                    recursivelyRegisterEntry(rootDir);
                } catch (IOException e) {
                    logger.error("unable to register monitoring", e);
                }
            }
        }

        WatchKey key;
        while ((key = watchService.poll()) != null) {
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
                                    logger.error("Error while processing file: {}", path, e);
                                }
                            });

            boolean isKeyValid = key.reset();
            if (!isKeyValid) { // key is invalid when the directory itself is no longer exists
                path2KeyMapping.remove((Path) key.watchable());
            }
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
        return readyForProcessingFiles.contains(path);
    }
}
