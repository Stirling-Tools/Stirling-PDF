package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.service.MobileScannerService.FileMetadata;
import stirling.software.common.service.MobileScannerService.SessionInfo;

/**
 * Unit tests for {@link MobileScannerService}. The service stores uploaded files in a temp
 * directory. To keep tests isolated and deterministic, the {@code tempDirectory} field is
 * redirected to a JUnit {@link TempDir} via reflection after construction.
 */
class MobileScannerServiceTest {

    @TempDir Path tempDir;

    private MobileScannerService service;

    @BeforeEach
    void setUp() throws IOException {
        service = new MobileScannerService();
        // Redirect the service's temp directory to the isolated test temp dir.
        ReflectionTestUtils.setField(service, "tempDirectory", tempDir);
    }

    private MultipartFile file(String name, String content) {
        return new MockMultipartFile(
                "file", name, "text/plain", content.getBytes(StandardCharsets.UTF_8));
    }

    private MultipartFile emptyFile(String name) {
        return new MockMultipartFile("file", name, "text/plain", new byte[0]);
    }

    @Nested
    @DisplayName("createSession")
    class CreateSession {

        @Test
        @DisplayName("creates a session and returns coherent SessionInfo")
        void createsSession() {
            SessionInfo info = service.createSession("abc-123");

            assertNotNull(info);
            assertEquals("abc-123", info.getSessionId());
            assertTrue(info.getCreatedAt() > 0);
            assertEquals(10 * 60 * 1000L, info.getTimeoutMs());
            assertEquals(info.getCreatedAt() + info.getTimeoutMs(), info.getExpiresAt());
        }

        @Test
        @DisplayName("session is retrievable via validateSession after creation")
        void createdSessionIsValid() {
            service.createSession("sess1");
            assertNotNull(service.validateSession("sess1"));
        }

        @Test
        @DisplayName("rejects null session ID")
        void rejectsNull() {
            assertThrows(IllegalArgumentException.class, () -> service.createSession(null));
        }

        @Test
        @DisplayName("rejects blank session ID")
        void rejectsBlank() {
            assertThrows(IllegalArgumentException.class, () -> service.createSession("   "));
        }

        @Test
        @DisplayName("rejects session ID with invalid characters")
        void rejectsInvalidChars() {
            assertThrows(IllegalArgumentException.class, () -> service.createSession("bad/id"));
            assertThrows(IllegalArgumentException.class, () -> service.createSession("bad id"));
            assertThrows(IllegalArgumentException.class, () -> service.createSession("bad_id"));
        }

        @Test
        @DisplayName("accepts alphanumeric and hyphen session IDs")
        void acceptsValidChars() {
            assertNotNull(service.createSession("ABC-def-123"));
        }
    }

    @Nested
    @DisplayName("validateSession")
    class ValidateSession {

        @Test
        @DisplayName("returns null for unknown session")
        void unknownReturnsNull() {
            assertNull(service.validateSession("does-not-exist"));
        }

        @Test
        @DisplayName("returns SessionInfo for an existing session")
        void existingReturnsInfo() {
            service.createSession("s1");
            SessionInfo info = service.validateSession("s1");

            assertNotNull(info);
            assertEquals("s1", info.getSessionId());
            assertEquals(10 * 60 * 1000L, info.getTimeoutMs());
        }

        @Test
        @DisplayName("expires and removes a session whose last access is in the past")
        void expiredSessionRemoved() {
            service.createSession("expired");

            // Force the underlying session's last access far into the past.
            forceLastAccess("expired", System.currentTimeMillis() - (20 * 60 * 1000L));

            assertNull(service.validateSession("expired"));
            // After expiry the session should be gone entirely.
            assertNull(service.validateSession("expired"));
        }
    }

    @Nested
    @DisplayName("uploadFiles")
    class UploadFiles {

        @Test
        @DisplayName("stores files and records metadata")
        void storesFiles() throws IOException {
            service.createSession("up1");
            service.uploadFiles("up1", List.of(file("scan.txt", "hello")));

            List<FileMetadata> metas = service.getSessionFiles("up1");
            assertEquals(1, metas.size());
            FileMetadata meta = metas.get(0);
            assertEquals("scan.txt", meta.getFilename());
            assertEquals(5, meta.getSize());
            assertEquals("text/plain", meta.getContentType());

            // File physically exists on disk.
            Path stored = tempDir.resolve("up1").resolve("scan.txt");
            assertTrue(Files.exists(stored));
            assertEquals("hello", Files.readString(stored));
        }

        @Test
        @DisplayName("auto-creates a session when uploading to an unregistered session ID")
        void autoCreatesSession() throws IOException {
            service.uploadFiles("new-session", List.of(file("a.txt", "data")));

            List<FileMetadata> metas = service.getSessionFiles("new-session");
            assertEquals(1, metas.size());
        }

        @Test
        @DisplayName("skips empty files")
        void skipsEmptyFiles() throws IOException {
            service.createSession("up2");
            service.uploadFiles("up2", List.of(emptyFile("empty.txt"), file("real.txt", "x")));

            List<FileMetadata> metas = service.getSessionFiles("up2");
            assertEquals(1, metas.size());
            assertEquals("real.txt", metas.get(0).getFilename());
        }

        @Test
        @DisplayName("sanitizes dangerous filename characters")
        void sanitizesFilename() throws IOException {
            service.createSession("up3");
            service.uploadFiles("up3", List.of(file("we ird@na#me.txt", "x")));

            List<FileMetadata> metas = service.getSessionFiles("up3");
            assertEquals(1, metas.size());
            String stored = metas.get(0).getFilename();
            // Disallowed chars replaced with underscores; allowed set is [a-zA-Z0-9._-].
            assertTrue(stored.matches("[a-zA-Z0-9._-]+"), "unexpected filename: " + stored);
            assertTrue(Files.exists(tempDir.resolve("up3").resolve(stored)));
        }

        @Test
        @DisplayName("handles duplicate filenames by appending a counter")
        void handlesDuplicateFilenames() throws IOException {
            service.createSession("up4");
            service.uploadFiles("up4", List.of(file("dup.txt", "one")));
            service.uploadFiles("up4", List.of(file("dup.txt", "two")));

            List<FileMetadata> metas = service.getSessionFiles("up4");
            assertEquals(2, metas.size());

            Path original = tempDir.resolve("up4").resolve("dup.txt");
            Path renamed = tempDir.resolve("up4").resolve("dup-1.txt");
            assertTrue(Files.exists(original));
            assertTrue(Files.exists(renamed));
            assertEquals("one", Files.readString(original));
            assertEquals("two", Files.readString(renamed));
        }

        @Test
        @DisplayName("falls back to a generated name when original filename is null")
        void generatesNameWhenNull() throws IOException {
            service.createSession("up5");
            MultipartFile noName =
                    new MockMultipartFile("file", null, "text/plain", "x".getBytes());
            service.uploadFiles("up5", List.of(noName));

            List<FileMetadata> metas = service.getSessionFiles("up5");
            assertEquals(1, metas.size());
            assertTrue(metas.get(0).getFilename().startsWith("upload-"));
        }

        @Test
        @DisplayName("rejects invalid session ID before any storage")
        void rejectsInvalidSessionId() {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> service.uploadFiles("bad/id", List.of(file("a.txt", "x"))));
        }

        @Test
        @DisplayName("uploading an empty list leaves no files")
        void emptyListNoFiles() throws IOException {
            service.createSession("up6");
            service.uploadFiles("up6", List.of());

            assertTrue(service.getSessionFiles("up6").isEmpty());
        }
    }

    @Nested
    @DisplayName("getSessionFiles")
    class GetSessionFiles {

        @Test
        @DisplayName("returns empty list for unknown session")
        void unknownReturnsEmpty() {
            assertTrue(service.getSessionFiles("nope").isEmpty());
        }

        @Test
        @DisplayName("returns a defensive copy of the metadata list")
        void returnsDefensiveCopy() throws IOException {
            service.createSession("g1");
            service.uploadFiles("g1", List.of(file("a.txt", "x")));

            List<FileMetadata> first = service.getSessionFiles("g1");
            first.clear();

            // Mutating the returned list must not affect the service's internal state.
            assertEquals(1, service.getSessionFiles("g1").size());
        }
    }

    @Nested
    @DisplayName("getFile")
    class GetFile {

        @Test
        @DisplayName("returns the path of an uploaded file")
        void returnsPath() throws IOException {
            service.createSession("f1");
            service.uploadFiles("f1", List.of(file("doc.txt", "body")));

            Path path = service.getFile("f1", "doc.txt");
            assertTrue(Files.exists(path));
            assertEquals("body", Files.readString(path));
        }

        @Test
        @DisplayName("throws when the session does not exist")
        void unknownSessionThrows() {
            IOException ex =
                    assertThrows(IOException.class, () -> service.getFile("ghost", "doc.txt"));
            assertTrue(ex.getMessage().contains("Session not found"));
        }

        @Test
        @DisplayName("throws when the file does not exist in an existing session")
        void unknownFileThrows() throws IOException {
            service.createSession("f2");
            service.uploadFiles("f2", List.of(file("present.txt", "x")));

            IOException ex =
                    assertThrows(IOException.class, () -> service.getFile("f2", "missing.txt"));
            assertTrue(ex.getMessage().contains("File not found"));
        }

        @Test
        @DisplayName("rejects filenames containing path separators")
        void rejectsPathSeparators() throws IOException {
            service.createSession("f3");
            service.uploadFiles("f3", List.of(file("ok.txt", "x")));

            assertThrows(IOException.class, () -> service.getFile("f3", "../escape.txt"));
            assertThrows(IOException.class, () -> service.getFile("f3", "sub/file.txt"));
            assertThrows(IOException.class, () -> service.getFile("f3", "sub\\file.txt"));
        }

        @Test
        @DisplayName("rejects blank filename")
        void rejectsBlankFilename() throws IOException {
            service.createSession("f4");
            service.uploadFiles("f4", List.of(file("ok.txt", "x")));

            assertThrows(IOException.class, () -> service.getFile("f4", "  "));
        }
    }

    @Nested
    @DisplayName("deleteFileAfterDownload")
    class DeleteFileAfterDownload {

        @Test
        @DisplayName("deletes a single file but keeps the session if others remain")
        void deletesOneFile() throws IOException {
            service.createSession("d1");
            service.uploadFiles("d1", List.of(file("a.txt", "x"), file("b.txt", "y")));

            service.deleteFileAfterDownload("d1", "a.txt");

            assertFalse(Files.exists(tempDir.resolve("d1").resolve("a.txt")));
            // Session still present because not all files have been downloaded.
            assertNotNull(service.validateSession("d1"));
        }

        @Test
        @DisplayName("deletes the entire session once all files are marked downloaded")
        void deletesSessionWhenAllDownloaded() throws IOException {
            service.createSession("d2");
            service.uploadFiles("d2", List.of(file("only.txt", "x")));

            // Mark the file as downloaded via getFile, then delete it.
            service.getFile("d2", "only.txt");
            service.deleteFileAfterDownload("d2", "only.txt");

            assertNull(service.validateSession("d2"));
            assertFalse(Files.exists(tempDir.resolve("d2")));
        }

        @Test
        @DisplayName("does not throw for an unknown session")
        void unknownSessionNoThrow() {
            assertDoesNotThrow(() -> service.deleteFileAfterDownload("ghost", "a.txt"));
        }

        @Test
        @DisplayName("swallows invalid filename input without throwing")
        void invalidFilenameNoThrow() throws IOException {
            service.createSession("d3");
            service.uploadFiles("d3", List.of(file("a.txt", "x")));

            assertDoesNotThrow(() -> service.deleteFileAfterDownload("d3", "../escape.txt"));
            // Original file untouched.
            assertTrue(Files.exists(tempDir.resolve("d3").resolve("a.txt")));
        }
    }

    @Nested
    @DisplayName("deleteSession")
    class DeleteSession {

        @Test
        @DisplayName("removes the session and all its files")
        void removesSessionAndFiles() throws IOException {
            service.createSession("x1");
            service.uploadFiles("x1", List.of(file("a.txt", "x"), file("b.txt", "y")));

            assertTrue(Files.exists(tempDir.resolve("x1")));

            service.deleteSession("x1");

            assertNull(service.validateSession("x1"));
            assertFalse(Files.exists(tempDir.resolve("x1")));
        }

        @Test
        @DisplayName("is a no-op for an unknown session")
        void unknownSessionNoOp() {
            assertDoesNotThrow(() -> service.deleteSession("never-existed"));
        }
    }

    @Nested
    @DisplayName("cleanupExpiredSessions")
    class CleanupExpiredSessions {

        @Test
        @DisplayName("removes sessions past the timeout")
        void removesExpired() throws IOException {
            service.createSession("old");
            service.uploadFiles("old", List.of(file("a.txt", "x")));
            forceLastAccess("old", System.currentTimeMillis() - (20 * 60 * 1000L));

            service.cleanupExpiredSessions();

            assertNull(service.validateSession("old"));
            assertFalse(Files.exists(tempDir.resolve("old")));
        }

        @Test
        @DisplayName("keeps sessions that are still fresh")
        void keepsFresh() {
            service.createSession("fresh");

            service.cleanupExpiredSessions();

            assertNotNull(service.validateSession("fresh"));
        }

        @Test
        @DisplayName("does not throw when there are no sessions")
        void noSessionsNoThrow() {
            assertDoesNotThrow(() -> service.cleanupExpiredSessions());
        }
    }

    @Nested
    @DisplayName("SessionInfo accessors")
    class SessionInfoAccessors {

        @Test
        @DisplayName("exposes all constructor values")
        void exposesValues() {
            SessionInfo info = new SessionInfo("id", 100L, 200L, 50L);
            assertEquals("id", info.getSessionId());
            assertEquals(100L, info.getCreatedAt());
            assertEquals(200L, info.getExpiresAt());
            assertEquals(50L, info.getTimeoutMs());
        }
    }

    @Nested
    @DisplayName("FileMetadata accessors")
    class FileMetadataAccessors {

        @Test
        @DisplayName("exposes all constructor values")
        void exposesValues() {
            FileMetadata meta = new FileMetadata("name.pdf", 1234L, "application/pdf");
            assertEquals("name.pdf", meta.getFilename());
            assertEquals(1234L, meta.getSize());
            assertEquals("application/pdf", meta.getContentType());
        }
    }

    /**
     * Reaches into the internal SessionData for a given session and forces its lastAccessTime, used
     * to deterministically simulate expiry without sleeping.
     */
    @SuppressWarnings("unchecked")
    private void forceLastAccess(String sessionId, long lastAccessTime) {
        java.util.Map<String, Object> sessions =
                (java.util.Map<String, Object>)
                        ReflectionTestUtils.getField(service, "activeSessions");
        assertNotNull(sessions);
        Object sessionData = sessions.get(sessionId);
        assertNotNull(sessionData, "session not found: " + sessionId);
        ReflectionTestUtils.setField(sessionData, "lastAccessTime", lastAccessTime);
    }
}
