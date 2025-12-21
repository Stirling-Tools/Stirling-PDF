package stirling.software.common.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import lombok.extern.slf4j.Slf4j;

/**
 * Service for handling mobile scanner file uploads and temporary storage. Files are stored
 * temporarily and automatically cleaned up after 10 minutes or upon retrieval.
 */
@Service
@Slf4j
public class MobileScannerService {

    private static final long SESSION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
    private final Map<String, SessionData> activeSessions = new ConcurrentHashMap<>();
    private final Path tempDirectory;

    public MobileScannerService() throws IOException {
        // Create temp directory for mobile scanner uploads
        this.tempDirectory =
                Paths.get(System.getProperty("java.io.tmpdir"), "stirling-mobile-scanner");
        Files.createDirectories(tempDirectory);
        log.info("Mobile scanner temp directory: {}", tempDirectory);
    }

    /**
     * Register a new session (called by desktop when QR code is generated)
     *
     * @param sessionId Unique session identifier
     * @return SessionInfo with creation time and expiry
     */
    public SessionInfo createSession(String sessionId) {
        validateSessionId(sessionId);

        SessionData session = new SessionData(sessionId);
        activeSessions.put(sessionId, session);

        log.info("Created mobile scanner session: {}", sessionId);
        return new SessionInfo(
                sessionId,
                session.createdAt,
                session.createdAt + SESSION_TIMEOUT_MS,
                SESSION_TIMEOUT_MS);
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

        long now = System.currentTimeMillis();
        long expiryTime = session.getLastAccessTime() + SESSION_TIMEOUT_MS;

        // Check if expired
        if (now > expiryTime) {
            deleteSession(sessionId);
            return null;
        }

        session.updateLastAccess();
        return new SessionInfo(sessionId, session.createdAt, expiryTime, SESSION_TIMEOUT_MS);
    }

    /**
     * Stores uploaded files for a session
     *
     * @param sessionId Unique session identifier
     * @param files Files to upload
     * @throws IOException If file storage fails
     */
    public void uploadFiles(String sessionId, List<MultipartFile> files) throws IOException {
        validateSessionId(sessionId);

        SessionData session =
                activeSessions.computeIfAbsent(sessionId, id -> new SessionData(sessionId));

        // Create session directory
        Path sessionDir = tempDirectory.resolve(sessionId);
        Files.createDirectories(sessionDir);

        // Save each file
        for (MultipartFile file : files) {
            if (file.isEmpty()) {
                continue;
            }

            String originalFilename = file.getOriginalFilename();
            if (originalFilename == null || originalFilename.isBlank()) {
                originalFilename = "upload-" + System.currentTimeMillis();
            }

            // Sanitize filename
            String safeFilename = sanitizeFilename(originalFilename);
            Path filePath = sessionDir.resolve(safeFilename);

            // Handle duplicate filenames
            int counter = 1;
            while (Files.exists(filePath)) {
                String nameWithoutExt = safeFilename.replaceFirst("[.][^.]+$", "");
                String ext =
                        safeFilename.contains(".")
                                ? safeFilename.substring(safeFilename.lastIndexOf("."))
                                : "";
                safeFilename = nameWithoutExt + "-" + counter + ext;
                filePath = sessionDir.resolve(safeFilename);
                counter++;
            }

            file.transferTo(filePath);
            session.addFile(new FileMetadata(safeFilename, file.getSize(), file.getContentType()));
            log.info(
                    "Uploaded file for session {}: {} ({} bytes)",
                    sessionId,
                    safeFilename,
                    file.getSize());
        }

        session.updateLastAccess();
    }

    /**
     * Retrieves file metadata for a session
     *
     * @param sessionId Session identifier
     * @return List of file metadata, or empty list if session doesn't exist
     */
    public List<FileMetadata> getSessionFiles(String sessionId) {
        SessionData session = activeSessions.get(sessionId);
        if (session == null) {
            return List.of();
        }
        session.updateLastAccess();
        return new ArrayList<>(session.getFiles());
    }

    /**
     * Retrieves actual file data for download
     *
     * @param sessionId Session identifier
     * @param filename Filename to retrieve
     * @return File path
     * @throws IOException If file not found or session doesn't exist
     */
    public Path getFile(String sessionId, String filename) throws IOException {
        SessionData session = activeSessions.get(sessionId);
        if (session == null) {
            throw new IOException("Session not found: " + sessionId);
        }

        Path filePath = tempDirectory.resolve(sessionId).resolve(filename);
        if (!Files.exists(filePath)) {
            throw new IOException("File not found: " + filename);
        }

        session.updateLastAccess();
        session.markFileAsDownloaded(filename);
        return filePath;
    }

    /**
     * Deletes a file after it has been served to the client. Should be called after successful
     * download.
     *
     * @param sessionId Session identifier
     * @param filename Filename to delete
     */
    public void deleteFileAfterDownload(String sessionId, String filename) {
        try {
            Path filePath = tempDirectory.resolve(sessionId).resolve(filename);
            Files.deleteIfExists(filePath);
            log.info("Deleted file after download: {}/{}", sessionId, filename);

            // Check if all files have been downloaded - if so, delete the entire session
            SessionData session = activeSessions.get(sessionId);
            if (session != null && session.allFilesDownloaded()) {
                deleteSession(sessionId);
                log.info("All files downloaded - deleted session: {}", sessionId);
            }
        } catch (IOException e) {
            log.warn("Failed to delete file after download: {}/{}", sessionId, filename, e);
        }
    }

    /**
     * Deletes a session and all its files
     *
     * @param sessionId Session to delete
     */
    public void deleteSession(String sessionId) {
        SessionData session = activeSessions.remove(sessionId);
        if (session != null) {
            try {
                Path sessionDir = tempDirectory.resolve(sessionId);
                if (Files.exists(sessionDir)) {
                    // Delete all files in session directory
                    Files.walk(sessionDir)
                            .sorted(
                                    (a, b) ->
                                            -a.compareTo(b)) // Reverse order to delete files before
                            // directory
                            .forEach(
                                    path -> {
                                        try {
                                            Files.deleteIfExists(path);
                                        } catch (IOException e) {
                                            log.warn("Failed to delete file: {}", path, e);
                                        }
                                    });
                }
                log.info("Deleted session: {}", sessionId);
            } catch (IOException e) {
                log.error("Error deleting session directory: {}", sessionId, e);
            }
        }
    }

    /** Scheduled cleanup of expired sessions (runs every 5 minutes) */
    @Scheduled(fixedRate = 5 * 60 * 1000)
    public void cleanupExpiredSessions() {
        long now = System.currentTimeMillis();
        List<String> expiredSessions = new ArrayList<>();

        activeSessions.forEach(
                (sessionId, session) -> {
                    if (now - session.getLastAccessTime() > SESSION_TIMEOUT_MS) {
                        expiredSessions.add(sessionId);
                    }
                });

        if (!expiredSessions.isEmpty()) {
            log.info("Cleaning up {} expired mobile scanner sessions", expiredSessions.size());
            expiredSessions.forEach(this::deleteSession);
        }
    }

    private void validateSessionId(String sessionId) {
        if (sessionId == null || sessionId.isBlank()) {
            throw new IllegalArgumentException("Session ID cannot be empty");
        }
        // Basic validation: alphanumeric and hyphens only
        if (!sessionId.matches("[a-zA-Z0-9-]+")) {
            throw new IllegalArgumentException("Invalid session ID format");
        }
    }

    private String sanitizeFilename(String filename) {
        // Remove path traversal attempts and dangerous characters
        return filename.replaceAll("[^a-zA-Z0-9._-]", "_");
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

    /** Session data tracking */
    private static class SessionData {
        private final String sessionId;
        private final List<FileMetadata> files = new ArrayList<>();
        private final Map<String, Boolean> downloadedFiles = new HashMap<>();
        private final long createdAt;
        private long lastAccessTime;

        public SessionData(String sessionId) {
            this.sessionId = sessionId;
            this.createdAt = System.currentTimeMillis();
            this.lastAccessTime = createdAt;
        }

        public void addFile(FileMetadata file) {
            files.add(file);
            downloadedFiles.put(file.getFilename(), false);
        }

        public List<FileMetadata> getFiles() {
            return files;
        }

        public void markFileAsDownloaded(String filename) {
            downloadedFiles.put(filename, true);
        }

        public boolean allFilesDownloaded() {
            return !downloadedFiles.isEmpty()
                    && downloadedFiles.values().stream().allMatch(downloaded -> downloaded);
        }

        public void updateLastAccess() {
            this.lastAccessTime = System.currentTimeMillis();
        }

        public long getLastAccessTime() {
            return lastAccessTime;
        }
    }
}
