package stirling.software.common.service;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.cluster.FileStore;
import stirling.software.common.util.JobContext;

/**
 * Service for storing and retrieving files with unique file IDs. Used by the AutoJobPostMapping
 * system to handle file references. Disk I/O is delegated to the injected {@link FileStore} bean.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class FileStorage {

    /** Holds the result of a stream-to-disk store operation: the file ID and the bytes written. */
    public record StoredFile(String fileId, long size) {}

    private final FileOrUploadService fileOrUploadService;
    private final FileStore fileStore;
    private final Optional<JobOwnershipService> jobOwnershipService;

    public String storeFile(MultipartFile file) throws IOException {
        String owner = resolveOwner();
        // Fast path: when Spring buffered the multipart to disk (typical for large uploads), the
        // backing Resource exposes a real File. Hand the Path to the FileStore so it can do a
        // file-to-file copy (Linux sendfile, no copy through Java heap) rather than streaming
        // the bytes through an 8K buffer. Falls back to the InputStream path for in-memory
        // multiparts, exotic Resource impls, and anything that does not back onto a File.
        Resource res;
        try {
            res = file.getResource();
        } catch (RuntimeException ignored) {
            res = null;
        }
        if (res != null && res.isFile()) {
            try {
                FileStore.Stored stored =
                        fileStore.store(res.getFile().toPath(), file.getOriginalFilename(), owner);
                log.debug("Stored file with ID: {} (fast path)", stored.fileId());
                return stored.fileId();
            } catch (IOException ex) {
                // Some Resource impls advertise isFile()=true but throw on getFile(); fall through.
                log.debug("Resource fast path failed, falling back to stream copy", ex);
            }
        }
        try (InputStream in = file.getInputStream()) {
            FileStore.Stored stored = fileStore.store(in, file.getOriginalFilename(), owner);
            log.debug("Stored file with ID: {}", stored.fileId());
            return stored.fileId();
        }
    }

    public String storeBytes(byte[] bytes, String originalName) throws IOException {
        FileStore.Stored stored =
                fileStore.store(new ByteArrayInputStream(bytes), originalName, resolveOwner());
        log.debug("Stored byte array with ID: {}", stored.fileId());
        return stored.fileId();
    }

    public MultipartFile retrieveFile(String fileId) throws IOException {
        enforceOwnership(fileId);
        byte[] fileData = fileStore.retrieveBytes(fileId);
        return fileOrUploadService.toMockMultipartFile(fileId, fileData);
    }

    public byte[] retrieveBytes(String fileId) throws IOException {
        enforceOwnership(fileId);
        return fileStore.retrieveBytes(fileId);
    }

    public InputStream retrieveInputStream(String fileId) throws IOException {
        enforceOwnership(fileId);
        return fileStore.retrieve(fileId);
    }

    public StoredFile storeInputStream(InputStream inputStream, String originalName)
            throws IOException {
        FileStore.Stored stored = fileStore.store(inputStream, originalName, resolveOwner());
        log.debug("Stored input stream with ID: {}", stored.fileId());
        return new StoredFile(stored.fileId(), stored.size());
    }

    public String storeFromStreamingBody(StreamingResponseBody body, String originalName)
            throws IOException {
        String owner = resolveOwner();
        // Hold Throwable not IOException: an unchecked failure (NPE, IllegalState, OOM, etc.)
        // from the body writer would otherwise close the pipe with EOF and the consumer would
        // return a truncated file with no error surfaced to the caller.
        AtomicReference<Throwable> bodyError = new AtomicReference<>();
        try (PipedOutputStream out = new PipedOutputStream();
                PipedInputStream in = new PipedInputStream(out, 8192)) {
            var executor = Executors.newSingleThreadExecutor(Thread.ofVirtual().factory());
            java.util.concurrent.Future<?> task = null;
            try {
                task =
                        executor.submit(
                                () -> {
                                    try {
                                        body.writeTo(out);
                                    } catch (Throwable ex) {
                                        bodyError.set(ex);
                                    } finally {
                                        try {
                                            out.close();
                                        } catch (IOException ignored) {
                                            // closed on the consumer side too
                                        }
                                    }
                                });
                FileStore.Stored stored = fileStore.store(in, originalName, owner);
                Throwable writerErr = bodyError.get();
                if (writerErr != null) {
                    // Body failed mid-write: the FileStore persisted a truncated entry.
                    // Best-effort delete so we don't leak partial files; never let cleanup
                    // mask the original writer error.
                    try {
                        fileStore.delete(stored.fileId());
                    } catch (RuntimeException cleanupEx) {
                        log.warn(
                                "Failed to delete partial file {} after writer error: {}",
                                stored.fileId(),
                                cleanupEx.getMessage());
                    }
                    if (writerErr instanceof IOException ioe) {
                        throw ioe;
                    }
                    throw new IOException(
                            "StreamingResponseBody writer failed: " + writerErr.getMessage(),
                            writerErr);
                }
                log.debug("Stored StreamingResponseBody with ID: {}", stored.fileId());
                return stored.fileId();
            } finally {
                // Interrupt and join the writer task: shutdown() alone returns immediately and a
                // failed store leaves the writer running, leaking a thread per failed upload.
                if (task != null && !task.isDone()) {
                    task.cancel(true);
                }
                executor.shutdown();
                try {
                    if (!executor.awaitTermination(5, java.util.concurrent.TimeUnit.SECONDS)) {
                        executor.shutdownNow();
                    }
                } catch (InterruptedException ie) {
                    executor.shutdownNow();
                    Thread.currentThread().interrupt();
                }
            }
        }
    }

    public String storeFromResource(Resource resource, String originalName) throws IOException {
        try (InputStream in = resource.getInputStream()) {
            FileStore.Stored stored = fileStore.store(in, originalName, resolveOwner());
            log.debug("Stored Resource with ID: {}", stored.fileId());
            return stored.fileId();
        }
    }

    public boolean deleteFile(String fileId) {
        enforceOwnership(fileId);
        return fileStore.delete(fileId);
    }

    public boolean fileExists(String fileId) {
        enforceOwnership(fileId);
        return fileStore.exists(fileId);
    }

    public long getFileSize(String fileId) throws IOException {
        enforceOwnership(fileId);
        return fileStore.size(fileId);
    }

    private String resolveOwner() {
        String propagated = JobContext.getOwner();
        if (propagated != null) {
            return propagated;
        }
        return jobOwnershipService.flatMap(JobOwnershipService::getCurrentUserId).orElse(null);
    }

    private void enforceOwnership(String fileId) {
        if (jobOwnershipService.isEmpty()) {
            return;
        }
        Optional<String> currentUser = jobOwnershipService.get().getCurrentUserId();
        if (currentUser.isEmpty()) {
            return;
        }
        String owner;
        try {
            owner = fileStore.getOwner(fileId);
        } catch (IOException e) {
            log.warn("Failed to read owner for file {}: {}", fileId, e.getMessage());
            throw new SecurityException(
                    "Access denied: could not verify ownership of the requested file");
        }
        if (owner == null) {
            return;
        }
        if (!owner.equals(currentUser.get())) {
            log.warn(
                    "Access denied: user {} attempted to access file {} owned by {}",
                    currentUser.get(),
                    fileId,
                    owner);
            throw new SecurityException(
                    "Access denied: you do not have permission to access this file");
        }
    }
}
