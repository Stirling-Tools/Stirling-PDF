package stirling.software.common.cluster.inprocess;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.FileStore;

/** Local-disk {@link FileStore} storing files under a base directory keyed by a UUID file id. */
@Slf4j
public class LocalDiskFileStore implements FileStore {

    private static final String OWNER_SUFFIX = ".owner";

    private final String baseDirPath;

    public LocalDiskFileStore(String baseDirPath) {
        this.baseDirPath = baseDirPath;
    }

    @Override
    public Stored store(InputStream in, String originalName, String owner) throws IOException {
        String fileId = UUID.randomUUID().toString();
        Path filePath = resolve(fileId);
        Files.createDirectories(filePath.getParent());
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
        if (fileId.contains("..") || fileId.contains("/") || fileId.contains("\\")) {
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
        return resolve(fileId).resolveSibling(fileId + OWNER_SUFFIX);
    }
}
