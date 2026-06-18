package stirling.software.common.cluster.inprocess;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import java.util.concurrent.locks.ReentrantLock;
import java.util.regex.Pattern;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.FileStore;

/** Local-disk {@link FileStore} storing files under a base directory keyed by a UUID file id. */
@Slf4j
public class LocalDiskFileStore implements FileStore {

    private static final String OWNER_SUFFIX = ".owner";

    // File ids are generated as random UUIDs; reject anything else so a tainted id can never reach
    // Files.* APIs (defence in depth on top of the resolve() prefix check, and silences CodeQL's
    // path-injection finding on the resolveOwner sidecar lookup).
    private static final Pattern UUID_PATTERN =
            Pattern.compile(
                    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    private final String baseDirPath;
    // Fixed-size lock stripes so concurrent store/delete on the same (or colliding) fileId
    // serialise the data-file + owner-sidecar pair as one critical section. Striped (not
    // per-id) so the map never has to be cleaned up; collisions across unrelated ids are
    // harmless contention.
    private static final int LOCK_STRIPES = 64;
    private final ReentrantLock[] stripes = new ReentrantLock[LOCK_STRIPES];

    public LocalDiskFileStore(String baseDirPath) {
        this.baseDirPath = baseDirPath;
        for (int i = 0; i < LOCK_STRIPES; i++) {
            stripes[i] = new ReentrantLock();
        }
    }

    @Override
    public Stored store(InputStream in, String originalName, String owner) throws IOException {
        String fileId = UUID.randomUUID().toString();
        Path filePath = resolve(fileId);
        Files.createDirectories(filePath.getParent());
        ReentrantLock lock = acquire(fileId);
        boolean success = false;
        try {
            long size = Files.copy(in, filePath);
            writeOwner(fileId, owner);
            success = true;
            return new Stored(fileId, size);
        } finally {
            if (!success) {
                cleanupAfterFailedStore(fileId, filePath);
            }
            release(fileId, lock);
        }
    }

    /**
     * File-to-file copy. {@link Files#copy(Path, Path, java.nio.file.CopyOption...)} can use {@code
     * sendfile(2)} on Linux for a zero-copy kernel transfer when source and destination share a
     * filesystem, avoiding the streaming overhead of pulling the bytes through the JVM heap. Reads
     * the source size before copying so the post-copy stat is unnecessary.
     */
    @Override
    public Stored store(Path source, String originalName, String owner) throws IOException {
        String fileId = UUID.randomUUID().toString();
        Path filePath = resolve(fileId);
        Files.createDirectories(filePath.getParent());
        long size = Files.size(source);
        ReentrantLock lock = acquire(fileId);
        boolean success = false;
        try {
            Files.copy(source, filePath);
            writeOwner(fileId, owner);
            success = true;
            return new Stored(fileId, size);
        } finally {
            if (!success) {
                cleanupAfterFailedStore(fileId, filePath);
            }
            release(fileId, lock);
        }
    }

    private void writeOwner(String fileId, String owner) throws IOException {
        if (owner == null || owner.isBlank()) {
            return;
        }
        Path ownerPath = resolveOwner(fileId);
        Files.write(ownerPath, owner.getBytes(StandardCharsets.UTF_8));
    }

    private void cleanupAfterFailedStore(String fileId, Path filePath) {
        try {
            Files.deleteIfExists(filePath);
        } catch (IOException cleanupEx) {
            log.warn("Failed to clean up partial file {} after store failure", filePath, cleanupEx);
        }
        try {
            Files.deleteIfExists(resolveOwner(fileId));
        } catch (IOException cleanupEx) {
            log.warn("Failed to clean up owner sidecar for {} after store failure", fileId);
        }
    }

    @Override
    public InputStream retrieve(String fileId) throws IOException {
        return new BufferedInputStream(Files.newInputStream(resolve(fileId)));
    }

    @Override
    public byte[] retrieveBytes(String fileId) throws IOException {
        Path filePath = resolve(fileId);
        if (!Files.exists(filePath)) {
            throw new IOException("File not found with ID: " + fileId);
        }
        return Files.readAllBytes(filePath);
    }

    @Override
    public long size(String fileId) throws IOException {
        Path filePath = resolve(fileId);
        if (!Files.exists(filePath)) {
            throw new IOException("File not found with ID: " + fileId);
        }
        return Files.size(filePath);
    }

    @Override
    public boolean delete(String fileId) {
        ReentrantLock lock = acquire(fileId);
        try {
            // Data first, owner second: a concurrent retrieve that observes the transient
            // (data-gone, owner-still-present) window simply fails with IOException; the inverse
            // order would briefly look like an unowned file and could grant cross-user access.
            boolean removed;
            try {
                removed = Files.deleteIfExists(resolve(fileId));
            } catch (IOException e) {
                log.error("Error deleting file with ID: {}", fileId, e);
                return false;
            }
            try {
                Files.deleteIfExists(resolveOwner(fileId));
            } catch (IOException e) {
                log.warn("Error deleting owner sidecar for file ID: {}", fileId, e);
            }
            return removed;
        } finally {
            release(fileId, lock);
        }
    }

    @Override
    public boolean exists(String fileId) {
        return Files.exists(resolve(fileId));
    }

    @Override
    public String getOwner(String fileId) throws IOException {
        Path ownerPath = resolveOwner(fileId);
        if (!Files.exists(ownerPath)) {
            return null;
        }
        byte[] bytes = Files.readAllBytes(ownerPath);
        if (bytes.length == 0) {
            return null;
        }
        return new String(bytes, StandardCharsets.UTF_8);
    }

    public Path resolve(String fileId) {
        if (fileId == null || !UUID_PATTERN.matcher(fileId).matches()) {
            throw new IllegalArgumentException("Invalid file ID");
        }
        Path basePath = Path.of(baseDirPath).normalize().toAbsolutePath();
        Path resolvedPath = basePath.resolve(fileId).normalize();
        if (!resolvedPath.startsWith(basePath)) {
            throw new IllegalArgumentException("File ID resolves to an invalid path");
        }
        return resolvedPath;
    }

    private Path resolveOwner(String fileId) {
        Path data = resolve(fileId);
        return data.resolveSibling(data.getFileName().toString() + OWNER_SUFFIX);
    }

    private ReentrantLock acquire(String fileId) {
        ReentrantLock lock = stripes[(fileId.hashCode() & Integer.MAX_VALUE) % LOCK_STRIPES];
        lock.lock();
        return lock;
    }

    private void release(String fileId, ReentrantLock lock) {
        lock.unlock();
    }
}
