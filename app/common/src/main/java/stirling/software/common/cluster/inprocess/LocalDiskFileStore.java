package stirling.software.common.cluster.inprocess;

import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.FileStore;

/** Local-disk {@link FileStore} storing files under a base directory keyed by a UUID file id. */
@Slf4j
public class LocalDiskFileStore implements FileStore {

    private final String baseDirPath;

    public LocalDiskFileStore(String baseDirPath) {
        this.baseDirPath = baseDirPath;
    }

    @Override
    public Stored store(InputStream in, String originalName) throws IOException {
        String fileId = UUID.randomUUID().toString();
        Path filePath = resolve(fileId);
        Files.createDirectories(filePath.getParent());
        boolean success = false;
        try {
            long size = Files.copy(in, filePath);
            success = true;
            return new Stored(fileId, size);
        } finally {
            if (!success) {
                try {
                    Files.deleteIfExists(filePath);
                } catch (IOException cleanupEx) {
                    log.warn(
                            "Failed to clean up partial file {} after store failure",
                            filePath,
                            cleanupEx);
                }
            }
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
        try {
            return Files.deleteIfExists(resolve(fileId));
        } catch (IOException e) {
            log.error("Error deleting file with ID: {}", fileId, e);
            return false;
        }
    }

    @Override
    public boolean exists(String fileId) {
        return Files.exists(resolve(fileId));
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
}
