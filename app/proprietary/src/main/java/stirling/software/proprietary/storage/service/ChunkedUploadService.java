package stirling.software.proprietary.storage.service;

import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import io.github.pixee.security.Filenames;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.api.ChunkedUploadResponse;
import stirling.software.proprietary.storage.model.api.CreateChunkedUploadRequest;
import stirling.software.proprietary.storage.model.api.StoredFileResponse;

/**
 * Writes chunks at their final offsets in one preallocated file, so completion needs no copy pass.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChunkedUploadService {

    static final int DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024;
    static final int MIN_CHUNK_SIZE = 256 * 1024;
    static final int MAX_CHUNK_SIZE = 32 * 1024 * 1024;
    static final long MAX_UPLOAD_SIZE = 10L * 1024 * 1024 * 1024;
    static final int MAX_CHUNKS = 4096;
    static final Duration SESSION_TTL = Duration.ofHours(1);
    static final Duration TEMP_FILE_TTL = Duration.ofHours(1);

    private final FileStorageService fileStorageService;
    private final ConcurrentHashMap<UUID, Session> sessions = new ConcurrentHashMap<>();

    private record Session(
            Long ownerId,
            String fileName,
            String contentType,
            long sizeBytes,
            int chunkSize,
            int totalChunks,
            Path directory,
            Path payload,
            Set<Integer> received,
            Instant createdAt) {}

    public ChunkedUploadResponse create(User owner, CreateChunkedUploadRequest request) {
        if (request.fileName() == null || request.fileName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "fileName is required");
        }
        if (request.sizeBytes() <= 0 || request.sizeBytes() > MAX_UPLOAD_SIZE) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "sizeBytes must be between 1 and 10 GiB");
        }
        int chunkSize =
                request.chunkSize() == null || request.chunkSize() <= 0
                        ? DEFAULT_CHUNK_SIZE
                        : Math.clamp(request.chunkSize(), MIN_CHUNK_SIZE, MAX_CHUNK_SIZE);
        int totalChunks = (int) ((request.sizeBytes() + chunkSize - 1) / chunkSize);
        if (totalChunks > MAX_CHUNKS) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Too many chunks; use a larger chunkSize");
        }
        fileStorageService.assertUploadWithinQuota(owner, request.sizeBytes());

        UUID uploadId = UUID.randomUUID();
        Path directory = null;
        try {
            directory = Files.createTempDirectory("stirling-chunked-");
            Path payload = directory.resolve("payload");
            try (RandomAccessFile sparse = new RandomAccessFile(payload.toFile(), "rw")) {
                sparse.setLength(request.sizeBytes());
            }
            String fileName = Filenames.toSimpleFileName(request.fileName());
            Session session =
                    new Session(
                            owner.getId(),
                            fileName != null && !fileName.isBlank() ? fileName : "upload",
                            request.contentType() != null
                                    ? request.contentType()
                                    : "application/octet-stream",
                            request.sizeBytes(),
                            chunkSize,
                            totalChunks,
                            directory,
                            payload,
                            ConcurrentHashMap.newKeySet(),
                            Instant.now());
            sessions.put(uploadId, session);
            return new ChunkedUploadResponse(uploadId, chunkSize, totalChunks);
        } catch (IOException e) {
            if (directory != null) {
                try {
                    Files.deleteIfExists(directory.resolve("payload"));
                    Files.deleteIfExists(directory);
                } catch (IOException ignored) {
                    // The OS temp cleaner is the final fallback.
                }
            }
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Could not open upload session", e);
        }
    }

    public void storeChunk(
            User owner, UUID uploadId, int index, InputStream data, long contentLength) {
        Session session = requireSession(owner, uploadId);
        if (index < 0 || index >= session.totalChunks()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Chunk index out of range");
        }
        long offset = (long) index * session.chunkSize();
        int expected = (int) Math.min(session.chunkSize(), session.sizeBytes() - offset);
        if (contentLength >= 0 && contentLength != expected) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Chunk " + index + " must be exactly " + expected + " bytes");
        }
        try (FileChannel channel = FileChannel.open(session.payload(), StandardOpenOption.WRITE)) {
            byte[] buffer = new byte[64 * 1024];
            long position = offset;
            long total = 0;
            int read;
            while ((read = data.read(buffer)) != -1) {
                total += read;
                if (total > expected) {
                    throw new ResponseStatusException(
                            HttpStatus.CONTENT_TOO_LARGE,
                            "Chunk " + index + " exceeds " + expected + " bytes");
                }
                ByteBuffer chunk = ByteBuffer.wrap(buffer, 0, read);
                while (chunk.hasRemaining()) {
                    int written = channel.write(chunk, position);
                    if (written <= 0) {
                        throw new IOException("Could not make progress writing chunk " + index);
                    }
                    position += written;
                }
            }
            if (total != expected) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Chunk " + index + " must be exactly " + expected + " bytes");
            }
            session.received().add(index);
        } catch (IOException e) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Could not store chunk", e);
        }
    }

    public StoredFileResponse complete(User owner, UUID uploadId) {
        Session session = requireSession(owner, uploadId);
        if (session.received().size() != session.totalChunks()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Missing chunks: "
                            + (session.totalChunks() - session.received().size())
                            + " of "
                            + session.totalChunks());
        }

        Path payload = session.payload();
        try {
            if (Files.size(payload) != session.sizeBytes()) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Uploaded payload size does not match sizeBytes");
            }
            PathMultipartFile file =
                    new PathMultipartFile(payload, session.fileName(), session.contentType());
            return fileStorageService.storeTemporaryFileResponse(owner, file, TEMP_FILE_TTL);
        } catch (IOException e) {
            throw new ResponseStatusException(
                    HttpStatus.INTERNAL_SERVER_ERROR, "Could not finalize upload", e);
        } finally {
            discard(uploadId, session);
        }
    }

    public void cancel(User owner, UUID uploadId) {
        Session session = requireSession(owner, uploadId);
        discard(uploadId, session);
    }

    @Scheduled(fixedDelay = 10, timeUnit = TimeUnit.MINUTES)
    public void purgeExpiredSessions() {
        Instant cutoff = Instant.now().minus(SESSION_TTL);
        for (var entry : sessions.entrySet()) {
            if (entry.getValue().createdAt().isBefore(cutoff)) {
                discard(entry.getKey(), entry.getValue());
            }
        }
    }

    private Session requireSession(User owner, UUID uploadId) {
        Session session = sessions.get(uploadId);
        if (session == null || !session.ownerId().equals(owner.getId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Upload session not found");
        }
        return session;
    }

    private void discard(UUID uploadId, Session session) {
        sessions.remove(uploadId, session);
        try (var paths = Files.walk(session.directory())) {
            paths.sorted(Comparator.reverseOrder())
                    .forEach(
                            path -> {
                                try {
                                    Files.deleteIfExists(path);
                                } catch (IOException ignored) {
                                    // Best effort; the OS temp cleaner is the final fallback.
                                }
                            });
        } catch (IOException e) {
            log.warn("Could not remove chunked upload directory {}", session.directory(), e);
        }
    }
}
