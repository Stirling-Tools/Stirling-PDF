package stirling.software.common.service;

import java.io.IOException;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;

/**
 * Service for handling mobile scanner file uploads and temporary storage. Files are stored
 * temporarily and automatically cleaned up after 10 minutes or upon retrieval.
 *
 * <p>Uploads need no login, so they only go to sessions a desktop created, sessions expire a fixed
 * time after creation, and storage is capped; a batch over a cap is rejected whole.
 */
@Service
@Slf4j
public class MobileScannerService {

    private static final long SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
    static final long MAX_FILE_BYTES = 50L * 1024 * 1024; // 50 MB
    static final long MAX_SESSION_BYTES = 500L * 1024 * 1024; // 500 MB
    static final int MAX_FILES_PER_SESSION = 500;
    static final long MAX_TOTAL_BYTES = 2L * 1024 * 1024 * 1024; // 2 GB
    static final int MAX_ACTIVE_SESSIONS = 1000;
    private static final Pattern FILENAME_SANITIZE_PATTERN = Pattern.compile("[^a-zA-Z0-9._-]");
    private static final Pattern SESSION_ID_VALIDATION_PATTERN = Pattern.compile("[a-zA-Z0-9-]+");
    private static final Pattern FILE_EXTENSION_PATTERN = Pattern.compile("[.][^.]+$");
    private final Map<String, SessionData> activeSessions = new ConcurrentHashMap<>();
    // Guards session create/delete and every SessionData count, so cap checks are atomic.
    private final Object storageLock = new Object();
    private final Path tempDirectory;

    public MobileScannerService() throws IOException {
        // Create temp directory for mobile scanner uploads
        this.tempDirectory =
                Path.of(System.getProperty("java.io.tmpdir"), "stirling-mobile-scanner");
        Files.createDirectories(tempDirectory);
        log.debug("Mobile scanner temp directory: {}", tempDirectory);
    }

    /**
     * Register a new session (called by desktop when QR code is generated)
     *
     * @param sessionId Unique session identifier; an existing session with this id is replaced and
     *     its files deleted
     * @return SessionInfo with creation time and expiry
     * @throws UploadLimitException if the live-session cap is reached
     */
    public SessionInfo createSession(String sessionId) {
        validateSessionId(sessionId);

        SessionData session = new SessionData(sessionId);
        synchronized (storageLock) {
            // Replacing only the entry would orphan the old session's files.
            deleteSession(sessionId);
            ensureSessionCapacity();
            activeSessions.put(sessionId, session);
        }

        log.info("Created mobile scanner session: {}", sessionId);
        return new SessionInfo(
                sessionId, session.createdAt, session.expiresAt(), SESSION_TIMEOUT_MS);
    }

    /**
     * Validate if a session exists and is not expired
     *
     * @param sessionId Session identifier to validate
     * @return SessionInfo if valid, null if invalid/expired
     */
    public SessionInfo validateSession(String sessionId) {
        SessionData session = activeSessions.get(sessionId);
        if (session == null) {
            return null;
        }

        if (session.isExpired(System.currentTimeMillis())) {
            deleteSession(sessionId);
            return null;
        }

        return new SessionInfo(
                sessionId, session.createdAt, session.expiresAt(), SESSION_TIMEOUT_MS);
    }

    /**
     * Stores uploaded files for a session
     *
     * @param sessionId Unique session identifier
     * @param files Files to upload
     * @throws IOException If file storage fails
     * @throws IllegalArgumentException if the session does not exist or has expired
     * @throws UploadLimitException if the batch would exceed a storage cap; nothing is stored
     */
    public void uploadFiles(String sessionId, List<MultipartFile> files) throws IOException {
        validateSessionId(sessionId);

        List<MultipartFile> nonEmpty = files.stream().filter(file -> !file.isEmpty()).toList();
        long batchBytes = 0;
        for (MultipartFile file : nonEmpty) {
            if (file.getSize() > MAX_FILE_BYTES) {
                throw new UploadLimitException("File exceeds the mobile upload size limit", false);
            }
            batchBytes += file.getSize();
        }

        SessionData session = reserve(sessionId, nonEmpty.size(), batchBytes);
        int unstoredFiles = nonEmpty.size();
        long unstoredBytes = batchBytes;
        try {
            Path sessionDir = getSafeSessionDirectory(sessionId);
            Files.createDirectories(sessionDir);

            for (MultipartFile file : nonEmpty) {
                storeFile(session, sessionDir, file);
                unstoredFiles--;
                unstoredBytes -= file.getSize();
            }
        } finally {
            if (unstoredFiles > 0) {
                synchronized (storageLock) {
                    session.fileCount -= unstoredFiles;
                    session.storedBytes -= unstoredBytes;
                }
            }
        }
    }

    /**
     * Reserves room for a batch. Counts and bytes are added up front so concurrent uploads cannot
     * both pass the same check.
     */
    private SessionData reserve(String sessionId, int fileCount, long bytes) {
        synchronized (storageLock) {
            // Only the logged-in desktop creates sessions.
            SessionData session = liveSession(sessionId);
            if (session == null) {
                throw new IllegalArgumentException("Session not found or expired");
            }
            if (session.fileCount + fileCount > MAX_FILES_PER_SESSION
                    || session.storedBytes + bytes > MAX_SESSION_BYTES) {
                throw new UploadLimitException("Session upload limit reached", false);
            }
            if (totalStoredBytes() + bytes > MAX_TOTAL_BYTES) {
                deleteExpiredSessions(System.currentTimeMillis());
            }
            if (totalStoredBytes() + bytes > MAX_TOTAL_BYTES) {
                throw new UploadLimitException("Mobile upload storage is full", true);
            }
            session.fileCount += fileCount;
            session.storedBytes += bytes;
            return session;
        }
    }

    private void storeFile(SessionData session, Path sessionDir, MultipartFile file)
            throws IOException {
        String originalFilename = file.getOriginalFilename();
        if (originalFilename == null || originalFilename.isBlank()) {
            originalFilename = "upload-" + System.currentTimeMillis();
        }

        String safeFilename = sanitizeFilename(originalFilename);
        Path filePath = sessionDir.resolve(safeFilename).normalize().toAbsolutePath();

        // Ensure resulting path stays within the session directory
        if (!filePath.startsWith(sessionDir)) {
            throw new IOException("Invalid filename");
        }

        // Handle duplicate filenames. createFile claims a name atomically, so concurrent
        // same-name uploads cannot share a path.
        int counter = 1;
        while (!tryCreate(filePath)) {
            String nameWithoutExt = FILE_EXTENSION_PATTERN.matcher(safeFilename).replaceFirst("");
            String ext =
                    safeFilename.contains(".")
                            ? safeFilename.substring(safeFilename.lastIndexOf('.'))
                            : "";
            safeFilename = nameWithoutExt + "-" + counter + ext;
            filePath = sessionDir.resolve(safeFilename).normalize().toAbsolutePath();
            if (!filePath.startsWith(sessionDir)) {
                throw new IOException("Invalid filename");
            }
            counter++;
        }

        try {
            file.transferTo(filePath);
        } catch (IOException | RuntimeException e) {
            Files.deleteIfExists(filePath);
            throw e;
        }
        synchronized (storageLock) {
            // Deleted or replaced mid-upload: the file would count toward no cap.
            if (activeSessions.get(session.sessionId) != session) {
                Files.deleteIfExists(filePath);
                throw new IOException("Session was removed during upload");
            }
            session.addFile(new FileMetadata(safeFilename, file.getSize(), file.getContentType()));
        }
        log.info(
                "Uploaded file for session {}: {} ({} bytes)",
                session.sessionId,
                safeFilename,
                file.getSize());
    }

    private static boolean tryCreate(Path filePath) throws IOException {
        try {
            Files.createFile(filePath);
            return true;
        } catch (FileAlreadyExistsException e) {
            return false;
        }
    }

    /**
     * Retrieves file metadata for a session
     *
     * @param sessionId Session identifier
     * @return List of file metadata, or empty list if session doesn't exist
     */
    public List<FileMetadata> getSessionFiles(String sessionId) {
        SessionData session = liveSession(sessionId);
        if (session == null) {
            return List.of();
        }
        synchronized (storageLock) {
            return new ArrayList<>(session.getFiles());
        }
    }

    /**
     * Retrieves actual file data for download
     *
     * @param sessionId Session identifier
     * @param filename Filename to retrieve
     * @return File path
     * @throws IOException If file not found, already claimed by an earlier download, or session
     *     doesn't exist
     */
    public Path getFile(String sessionId, String filename) throws IOException {
        SessionData session = liveSession(sessionId);
        if (session == null) {
            throw new IOException("Session not found: " + sessionId);
        }

        Path filePath = getSafeFilePath(sessionId, filename);
        if (!Files.exists(filePath)) {
            throw new IOException("File not found: " + filename);
        }

        // Served once, as the file stays on disk while it streams. Checking the stored name rather
        // than the disk also rejects other spellings on case-insensitive filesystems.
        synchronized (storageLock) {
            if (!session.isStored(filename)) {
                throw new IOException("File not found: " + filename);
            }
            if (session.isDownloaded(filename)) {
                throw new IOException("File already downloaded: " + filename);
            }
            session.markFileAsDownloaded(filename);
        }
        return filePath;
    }

    /**
     * Deletes a file after it has been served to the client. The session stays open until it
     * expires or the desktop deletes it, so the phone can send further batches to the same QR code.
     *
     * @param sessionId Session identifier
     * @param filename Filename to delete
     */
    public void deleteFileAfterDownload(String sessionId, String filename) {
        try {
            Path filePath = getSafeFilePath(sessionId, filename);
            SessionData session = activeSessions.get(sessionId);
            if (session == null) {
                return;
            }
            synchronized (storageLock) {
                // Unclaimed means the id was re-created mid-download and the name is a new file.
                if (!session.isDownloaded(filename)) {
                    return;
                }
                // Released while the file is still on disk, so no new upload can reuse the name.
                session.releaseFile(filename);
            }
            Files.deleteIfExists(filePath);
            log.info("Deleted file after download: {}/{}", sessionId, filename);
        } catch (IOException | IllegalArgumentException e) {
            log.warn("Failed to delete file after download: {}/{}", sessionId, filename, e);
        }
    }

    /**
     * Makes a claimed file downloadable again after a download that did not send all of it.
     *
     * @param sessionId Session identifier
     * @param filename Filename whose claim is dropped
     */
    public void releaseDownloadClaim(String sessionId, String filename) {
        SessionData session = activeSessions.get(sessionId);
        if (session == null) {
            return;
        }
        synchronized (storageLock) {
            if (session.isDownloaded(filename)) {
                session.unmarkDownloaded(filename);
            }
        }
    }

    /**
     * Deletes a session and all its files
     *
     * @param sessionId Session to delete
     */
    public void deleteSession(String sessionId) {
        // Locked so createSession cannot re-register the id before the walk deletes its files.
        synchronized (storageLock) {
            SessionData session = activeSessions.remove(sessionId);
            if (session != null) {
                deleteSessionDirectory(sessionId);
                log.info("Deleted session: {}", sessionId);
            } else if (sessionId != null
                    && SESSION_ID_VALIDATION_PATTERN.matcher(sessionId).matches()) {
                // A directory can outlive its entry (e.g. an earlier delete raced an upload).
                deleteSessionDirectory(sessionId);
            }
        }
    }

    private void deleteSessionDirectory(String sessionId) {
        try {
            Path sessionDir = getSafeSessionDirectory(sessionId);
            if (Files.exists(sessionDir)) {
                try (var paths = Files.walk(sessionDir)) {
                    // Deepest first, so each directory is empty when its turn comes.
                    paths.sorted((a, b) -> -a.compareTo(b))
                            .forEach(
                                    path -> {
                                        try {
                                            Files.deleteIfExists(path);
                                        } catch (IOException e) {
                                            log.warn("Failed to delete file: {}", path, e);
                                        }
                                    });
                }
            }
        } catch (IllegalArgumentException e) {
            log.warn(
                    "Refused to delete session with invalid sessionId '{}': {}",
                    sessionId,
                    e.getMessage());
        } catch (IOException e) {
            log.error("Error deleting session directory: {}", sessionId, e);
        }
    }

    /** Scheduled cleanup of expired sessions (runs every 5 minutes) */
    @Scheduled(fixedRate = 5 * 60 * 1000)
    public void cleanupExpiredSessions() {
        long now = System.currentTimeMillis();
        synchronized (storageLock) {
            deleteExpiredSessions(now);
        }
        deleteOrphanedDirectories(now);
    }

    // Caller must hold storageLock.
    private void deleteExpiredSessions(long now) {
        List<String> expired =
                activeSessions.entrySet().stream()
                        .filter(entry -> entry.getValue().isExpired(now))
                        .map(Map.Entry::getKey)
                        .toList();
        if (!expired.isEmpty()) {
            log.info("Cleaning up {} expired mobile scanner sessions", expired.size());
            expired.forEach(this::deleteSession);
        }
    }

    /** Removes session directories with no live session, such as those left before a restart. */
    private void deleteOrphanedDirectories(long now) {
        if (!Files.isDirectory(tempDirectory)) {
            return;
        }
        List<Path> dirs;
        try (var paths = Files.list(tempDirectory)) {
            dirs =
                    paths.filter(Files::isDirectory)
                            .filter(
                                    dir ->
                                            SESSION_ID_VALIDATION_PATTERN
                                                    .matcher(dir.getFileName().toString())
                                                    .matches())
                            .toList();
        } catch (IOException e) {
            log.warn("Failed to list mobile scanner temp directory", e);
            return;
        }
        for (Path dir : dirs) {
            String sessionId = dir.getFileName().toString();
            try {
                if (activeSessions.containsKey(sessionId)
                        || now - Files.getLastModifiedTime(dir).toMillis() <= SESSION_TIMEOUT_MS) {
                    continue;
                }
            } catch (IOException e) {
                continue;
            }
            synchronized (storageLock) {
                if (!activeSessions.containsKey(sessionId)) {
                    log.info("Deleting orphaned mobile scanner directory: {}", sessionId);
                    deleteSessionDirectory(sessionId);
                }
            }
        }
    }

    // Caller must hold storageLock. Expired sessions are purged first so they stop holding the
    // caps before the next sweep.
    private void ensureSessionCapacity() {
        if (activeSessions.size() >= MAX_ACTIVE_SESSIONS) {
            deleteExpiredSessions(System.currentTimeMillis());
        }
        if (activeSessions.size() >= MAX_ACTIVE_SESSIONS) {
            throw new UploadLimitException("Too many active mobile upload sessions", true);
        }
    }

    /**
     * @return bytes the session can still accept, or -1 if it does not exist or has expired
     */
    public long remainingSessionBytes(String sessionId) {
        if (sessionId == null) {
            return -1;
        }
        synchronized (storageLock) {
            SessionData session = liveSession(sessionId);
            return session == null ? -1 : MAX_SESSION_BYTES - session.storedBytes;
        }
    }

    private SessionData liveSession(String sessionId) {
        SessionData session = activeSessions.get(sessionId);
        return session == null || session.isExpired(System.currentTimeMillis()) ? null : session;
    }

    // Caller must hold storageLock. Bounded by MAX_ACTIVE_SESSIONS, so a scan is cheap.
    private long totalStoredBytes() {
        long total = 0;
        for (SessionData session : activeSessions.values()) {
            total += session.storedBytes;
        }
        return total;
    }

    private void validateSessionId(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            throw new IllegalArgumentException("Session ID cannot be empty");
        }
        // Basic validation: alphanumeric and hyphens only
        if (!SESSION_ID_VALIDATION_PATTERN.matcher(sessionId).matches()) {
            throw new IllegalArgumentException("Invalid session ID format");
        }
    }

    private String sanitizeFilename(String filename) {
        // Remove path traversal attempts and dangerous characters
        String sanitized = FILENAME_SANITIZE_PATTERN.matcher(filename).replaceAll("_");
        // Ensure we have a non-empty, safe filename
        if (sanitized.isBlank()) {
            sanitized = "upload-" + System.currentTimeMillis();
        }
        return sanitized;
    }

    /**
     * Safely resolves and validates a session directory path to prevent directory traversal
     * attacks.
     *
     * @param sessionId Session identifier
     * @return Normalized absolute path to the session directory
     * @throws IllegalArgumentException if the resolved path escapes the temp directory
     */
    private Path getSafeSessionDirectory(String sessionId) {
        validateSessionId(sessionId);

        Path baseDir = tempDirectory.normalize().toAbsolutePath();
        Path sessionDir = baseDir.resolve(sessionId).normalize().toAbsolutePath();

        // Verify the resolved path is still within the temp directory
        if (!sessionDir.startsWith(baseDir)) {
            throw new IllegalArgumentException("Invalid session ID: path traversal detected");
        }

        return sessionDir;
    }

    /**
     * Safely resolves and validates a file path within a session directory to prevent directory
     * traversal attacks.
     *
     * @param sessionId Session identifier
     * @param filename Filename within the session
     * @return Normalized absolute path to the file
     * @throws IOException if the resolved path escapes the session directory
     */
    private Path getSafeFilePath(String sessionId, String filename) throws IOException {
        if (filename == null || filename.isBlank()) {
            throw new IOException("Filename cannot be empty");
        }

        // Additional validation: reject filenames with path separators or parent references
        if (filename.contains("..") || filename.contains("/") || filename.contains("\\")) {
            throw new IOException(
                    "Invalid filename: contains path separators or parent references");
        }

        Path sessionDir = getSafeSessionDirectory(sessionId);
        Path filePath = sessionDir.resolve(filename).normalize().toAbsolutePath();

        // Verify the resolved path is still within the session directory
        if (!filePath.startsWith(sessionDir)) {
            throw new IOException("Invalid filename: path traversal detected");
        }

        return filePath;
    }

    /** Session information for client */
    public static class SessionInfo {
        private final String sessionId;
        private final long createdAt;
        private final long expiresAt;
        private final long timeoutMs;

        public SessionInfo(String sessionId, long createdAt, long expiresAt, long timeoutMs) {
            this.sessionId = sessionId;
            this.createdAt = createdAt;
            this.expiresAt = expiresAt;
            this.timeoutMs = timeoutMs;
        }

        public String getSessionId() {
            return sessionId;
        }

        public long getCreatedAt() {
            return createdAt;
        }

        public long getExpiresAt() {
            return expiresAt;
        }

        public long getTimeoutMs() {
            return timeoutMs;
        }
    }

    /** File metadata for client */
    public static class FileMetadata {
        private final String filename;
        private final long size;
        private final String contentType;

        public FileMetadata(String filename, long size, String contentType) {
            this.filename = filename;
            this.size = size;
            this.contentType = contentType;
        }

        public String getFilename() {
            return filename;
        }

        public long getSize() {
            return size;
        }

        public String getContentType() {
            return contentType;
        }
    }

    /** Thrown when an upload or new session would exceed a mobile scanner storage cap. */
    public static class UploadLimitException extends RuntimeException {
        private final boolean serverCapacity;

        public UploadLimitException(String message, boolean serverCapacity) {
            super(message);
            this.serverCapacity = serverCapacity;
        }

        /**
         * @return true if the server-wide cap was hit rather than a per-file or per-session one
         */
        public boolean isServerCapacity() {
            return serverCapacity;
        }
    }

    /** Session data tracking. Files and counters are guarded by {@code storageLock}. */
    private static class SessionData {
        private final String sessionId;
        private final List<FileMetadata> files = new ArrayList<>();
        private final Map<String, Boolean> downloadedFiles = new HashMap<>();
        private final Map<String, Long> storedFileSizes = new HashMap<>();
        private final long createdAt;
        // Includes bytes reserved for uploads still being written.
        private long storedBytes;
        // Every file accepted over the session's life; downloads do not give the slot back.
        private int fileCount;

        public SessionData(String sessionId) {
            this.sessionId = sessionId;
            this.createdAt = System.currentTimeMillis();
        }

        public void addFile(FileMetadata file) {
            files.add(file);
            downloadedFiles.put(file.getFilename(), false);
            storedFileSizes.put(file.getFilename(), file.getSize());
        }

        public void releaseFile(String filename) {
            Long size = storedFileSizes.remove(filename);
            if (size != null) {
                storedBytes -= size;
            }
            files.removeIf(file -> file.getFilename().equals(filename));
            downloadedFiles.remove(filename);
        }

        public List<FileMetadata> getFiles() {
            return files;
        }

        public boolean isStored(String filename) {
            return storedFileSizes.containsKey(filename);
        }

        public boolean isDownloaded(String filename) {
            return Boolean.TRUE.equals(downloadedFiles.get(filename));
        }

        public void markFileAsDownloaded(String filename) {
            downloadedFiles.put(filename, true);
        }

        public void unmarkDownloaded(String filename) {
            downloadedFiles.put(filename, false);
        }

        // Fixed at creation, so polling cannot keep a session alive.
        public long expiresAt() {
            return createdAt + SESSION_TIMEOUT_MS;
        }

        public boolean isExpired(long now) {
            return now > expiresAt();
        }
    }
}
