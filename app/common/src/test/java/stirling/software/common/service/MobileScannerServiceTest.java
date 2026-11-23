package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.ArrayList;
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
import stirling.software.common.service.MobileScannerService.UploadLimitException;

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
        @DisplayName("expires and removes a session created more than the timeout ago")
        void expiredSessionRemoved() {
            service.createSession("expired");

            forceCreatedAt("expired", System.currentTimeMillis() - (20 * 60 * 1000L));

            assertNull(service.validateSession("expired"));
            // After expiry the session should be gone entirely.
            assertNull(service.validateSession("expired"));
        }

        @Test
        @DisplayName("an expired session's files are not listed or served before the sweep")
        void expiredSessionHidesFiles() throws IOException {
            service.createSession("gone");
            service.uploadFiles("gone", List.of(file("a.txt", "x")));
            forceCreatedAt("gone", System.currentTimeMillis() - (20 * 60 * 1000L));

            assertTrue(service.getSessionFiles("gone").isEmpty());
            assertThrows(IOException.class, () -> service.getFile("gone", "a.txt"));
        }

        @Test
        @DisplayName("remainingSessionBytes reports a live session's room and -1 otherwise")
        void remainingSessionBytes() throws IOException {
            service.createSession("live");
            service.uploadFiles("live", List.of(file("a.txt", "xyz")));
            service.createSession("dead");
            forceCreatedAt("dead", System.currentTimeMillis() - (20 * 60 * 1000L));

            assertEquals(
                    MobileScannerService.MAX_SESSION_BYTES - 3,
                    service.remainingSessionBytes("live"));
            assertEquals(-1, service.remainingSessionBytes("dead"));
            assertEquals(-1, service.remainingSessionBytes("never"));
            assertEquals(-1, service.remainingSessionBytes(null));
        }

        @Test
        @DisplayName("reads do not push the expiry back")
        void readsDoNotExtendExpiry() throws IOException {
            long expiresAt = service.createSession("fixed").getExpiresAt();
            service.uploadFiles("fixed", List.of(file("a.txt", "x")));

            service.getSessionFiles("fixed");
            service.getFile("fixed", "a.txt");

            assertEquals(expiresAt, service.validateSession("fixed").getExpiresAt());
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
        @DisplayName("rejects uploads to a session that was never created")
        void rejectsUnknownSession() {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> service.uploadFiles("new-session", List.of(file("a.txt", "data"))));

            assertNull(service.validateSession("new-session"));
            assertFalse(Files.exists(tempDir.resolve("new-session")));
        }

        @Test
        @DisplayName("rejects uploads to an expired session")
        void rejectsExpiredSession() {
            service.createSession("late");
            forceCreatedAt("late", System.currentTimeMillis() - (20 * 60 * 1000L));

            assertThrows(
                    IllegalArgumentException.class,
                    () -> service.uploadFiles("late", List.of(file("a.txt", "data"))));
        }

        @Test
        @DisplayName("accepts another batch after the first one was collected")
        void acceptsBatchAfterCollection() throws IOException {
            service.createSession("again");
            service.uploadFiles("again", List.of(file("a.txt", "x")));
            service.getFile("again", "a.txt");
            service.deleteFileAfterDownload("again", "a.txt");

            service.uploadFiles("again", List.of(file("b.txt", "y")));

            assertEquals(
                    List.of("b.txt"),
                    service.getSessionFiles("again").stream()
                            .map(FileMetadata::getFilename)
                            .toList());
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
    @DisplayName("getFile claims")
    class GetFileClaims {

        @Test
        @DisplayName("a file can be claimed for download only once")
        void claimedOnce() throws IOException {
            service.createSession("c1");
            service.uploadFiles("c1", List.of(file("a.txt", "x")));

            service.getFile("c1", "a.txt");

            assertThrows(IOException.class, () -> service.getFile("c1", "a.txt"));
        }

        @Test
        @DisplayName("a re-uploaded file with a downloaded name can be claimed again")
        void reuploadedNameClaimable() throws IOException {
            service.createSession("c2");
            service.uploadFiles("c2", List.of(file("a.txt", "x"), file("b.txt", "y")));
            service.getFile("c2", "a.txt");
            service.deleteFileAfterDownload("c2", "a.txt");

            service.uploadFiles("c2", List.of(file("a.txt", "z")));

            assertDoesNotThrow(() -> service.getFile("c2", "a.txt"));
        }

        @Test
        @DisplayName("a file on disk that the session did not store is not served")
        void unstoredFileNotServed() throws IOException {
            service.createSession("c3");
            service.uploadFiles("c3", List.of(file("a.txt", "x")));
            Files.writeString(tempDir.resolve("c3").resolve("other.txt"), "y");

            assertThrows(IOException.class, () -> service.getFile("c3", "other.txt"));
            assertDoesNotThrow(() -> service.getFile("c3", "a.txt"));
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

            service.getFile("d1", "a.txt");
            service.deleteFileAfterDownload("d1", "a.txt");

            assertFalse(Files.exists(tempDir.resolve("d1").resolve("a.txt")));
            assertNotNull(service.validateSession("d1"));
        }

        @Test
        @DisplayName("keeps the session open once every file is downloaded")
        void keepsSessionWhenAllDownloaded() throws IOException {
            service.createSession("d2");
            service.uploadFiles("d2", List.of(file("only.txt", "x")));

            service.getFile("d2", "only.txt");
            service.deleteFileAfterDownload("d2", "only.txt");

            assertNotNull(service.validateSession("d2"));
            assertTrue(service.getSessionFiles("d2").isEmpty());
            assertFalse(Files.exists(tempDir.resolve("d2").resolve("only.txt")));
        }

        @Test
        @DisplayName("leaves an unclaimed file alone, such as a new upload to a re-created id")
        void ignoresUnclaimedFile() throws IOException {
            service.createSession("d4");
            service.uploadFiles("d4", List.of(file("a.txt", "x")));

            service.deleteFileAfterDownload("d4", "a.txt");

            assertTrue(Files.exists(tempDir.resolve("d4").resolve("a.txt")));
            assertEquals(1, service.getSessionFiles("d4").size());
        }

        @Test
        @DisplayName("a released claim makes the file downloadable again")
        void releasedClaimAllowsRetry() throws IOException {
            service.createSession("d5");
            service.uploadFiles("d5", List.of(file("a.txt", "x")));
            service.getFile("d5", "a.txt");

            service.releaseDownloadClaim("d5", "a.txt");

            assertDoesNotThrow(() -> service.getFile("d5", "a.txt"));
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
        @DisplayName("removes a leftover directory even when the session is unknown")
        void removesLeftoverDirectory() throws IOException {
            Path leftover = Files.createDirectories(tempDir.resolve("leftover"));
            Files.write(leftover.resolve("a.jpg"), new byte[] {1});

            service.deleteSession("leftover");

            assertFalse(Files.exists(leftover));
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
            forceCreatedAt("old", System.currentTimeMillis() - (20 * 60 * 1000L));

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
        @DisplayName("removes stale directories that have no live session")
        void removesOrphanedDirectories() throws IOException {
            Path stale = Files.createDirectories(tempDir.resolve("stale"));
            Files.write(stale.resolve("a.jpg"), new byte[] {1});
            Files.setLastModifiedTime(
                    stale, FileTime.fromMillis(System.currentTimeMillis() - 20 * 60 * 1000L));
            Path recent = Files.createDirectories(tempDir.resolve("recent"));
            service.createSession("live");
            service.uploadFiles("live", List.of(file("a.txt", "x")));
            Files.setLastModifiedTime(
                    tempDir.resolve("live"),
                    FileTime.fromMillis(System.currentTimeMillis() - 20 * 60 * 1000L));

            service.cleanupExpiredSessions();

            assertFalse(Files.exists(stale));
            assertTrue(Files.exists(recent));
            assertTrue(Files.exists(tempDir.resolve("live").resolve("a.txt")));
        }

        @Test
        @DisplayName("does not throw when there are no sessions")
        void noSessionsNoThrow() {
            assertDoesNotThrow(() -> service.cleanupExpiredSessions());
        }
    }

    @Nested
    @DisplayName("storage limits")
    class StorageLimits {

        private static final long MAX_FILE = MobileScannerService.MAX_FILE_BYTES;

        @Test
        @DisplayName("rejects a file over the per-file cap and stores nothing from the batch")
        void rejectsOversizedFile() {
            service.createSession("big");
            UploadLimitException e =
                    assertThrows(
                            UploadLimitException.class,
                            () ->
                                    service.uploadFiles(
                                            "big",
                                            List.of(
                                                    file("ok.txt", "x"),
                                                    sized("huge.jpg", MAX_FILE + 1))));

            assertFalse(e.isServerCapacity());
            assertFalse(Files.exists(tempDir.resolve("big")));
            assertTrue(service.getSessionFiles("big").isEmpty());
        }

        @Test
        @DisplayName("rejects a batch that would exceed the per-session file count")
        void rejectsTooManyFiles() throws IOException {
            List<MultipartFile> files = new ArrayList<>();
            for (int i = 0; i < MobileScannerService.MAX_FILES_PER_SESSION; i++) {
                files.add(file("f" + i + ".txt", "x"));
            }
            service.createSession("many");
            service.uploadFiles("many", files);

            assertThrows(
                    UploadLimitException.class,
                    () -> service.uploadFiles("many", List.of(file("one-more.txt", "x"))));
            assertEquals(
                    MobileScannerService.MAX_FILES_PER_SESSION,
                    service.getSessionFiles("many").size());
        }

        @Test
        @DisplayName("rejects uploads past the per-session byte cap")
        void rejectsSessionBytes() throws IOException {
            fillSession("s", MobileScannerService.MAX_SESSION_BYTES);

            UploadLimitException e =
                    assertThrows(
                            UploadLimitException.class,
                            () -> service.uploadFiles("s", List.of(file("extra.txt", "x"))));
            assertFalse(e.isServerCapacity());
        }

        @Test
        @DisplayName("rejects uploads past the server-wide byte cap")
        void rejectsTotalBytes() throws IOException {
            fillServer();
            service.createSession("other");

            UploadLimitException e =
                    assertThrows(
                            UploadLimitException.class,
                            () -> service.uploadFiles("other", List.of(file("a.txt", "x"))));
            assertTrue(e.isServerCapacity());
        }

        @Test
        @DisplayName("a downloaded file frees its bytes")
        void downloadReleasesBytes() throws IOException {
            fillServer();
            service.getFile("fill-0", "f0.jpg");
            service.deleteFileAfterDownload("fill-0", "f0.jpg");
            service.createSession("other");

            assertDoesNotThrow(() -> service.uploadFiles("other", List.of(file("a.txt", "x"))));
        }

        @Test
        @DisplayName("deleting a session frees its bytes")
        void deleteSessionReleasesBytes() throws IOException {
            fillServer();
            service.deleteSession("fill-0");
            service.createSession("other");

            assertDoesNotThrow(() -> service.uploadFiles("other", List.of(file("a.txt", "x"))));
        }

        @Test
        @DisplayName("a reused filename releases only its own size")
        void reusedFilenameReleasesOwnSize() throws IOException {
            service.createSession("r");
            service.uploadFiles("r", List.of(sized("a.jpg", MAX_FILE), file("keep.txt", "x")));
            service.getFile("r", "a.jpg");
            service.deleteFileAfterDownload("r", "a.jpg");
            service.uploadFiles("r", List.of(sized("a.jpg", 10)));
            service.getFile("r", "a.jpg");
            service.deleteFileAfterDownload("r", "a.jpg");

            assertEquals(1L, storedBytes());
        }

        @Test
        @DisplayName("a failed write releases its reservation")
        void failedWriteReleasesReservation() {
            MultipartFile failing =
                    new MockMultipartFile("file", "bad.jpg", "image/jpeg", new byte[] {1}) {
                        @Override
                        public long getSize() {
                            return MAX_FILE;
                        }

                        @Override
                        public void transferTo(Path dest) throws IOException {
                            throw new IOException("disk full");
                        }
                    };

            service.createSession("f");
            assertThrows(IOException.class, () -> service.uploadFiles("f", List.of(failing)));
            assertEquals(0L, storedBytes());
        }

        @Test
        @DisplayName("caps the number of live sessions, but re-creating an existing id is allowed")
        void capsSessions() {
            for (int i = 0; i < MobileScannerService.MAX_ACTIVE_SESSIONS; i++) {
                service.createSession("s" + i);
            }

            UploadLimitException e =
                    assertThrows(UploadLimitException.class, () -> service.createSession("new"));
            assertTrue(e.isServerCapacity());
            assertDoesNotThrow(() -> service.createSession("s0"));
        }

        @Test
        @DisplayName("expired sessions stop holding the caps before the sweep runs")
        void expiredSessionsFreeCaps() throws IOException {
            fillServer();
            for (int i = 0; i < 4; i++) {
                forceCreatedAt("fill-" + i, System.currentTimeMillis() - (20 * 60 * 1000L));
            }
            service.createSession("other");

            assertDoesNotThrow(() -> service.uploadFiles("other", List.of(file("a.txt", "x"))));
            assertFalse(Files.exists(tempDir.resolve("fill-0")));
        }

        @Test
        @DisplayName("re-creating a session deletes its old files and frees their bytes")
        void recreateDeletesOldFiles() throws IOException {
            service.createSession("again");
            service.uploadFiles("again", List.of(sized("a.jpg", MAX_FILE)));

            service.createSession("again");

            assertFalse(Files.exists(tempDir.resolve("again").resolve("a.jpg")));
            assertTrue(service.getSessionFiles("again").isEmpty());
            assertEquals(0L, storedBytes());
        }

        @Test
        @DisplayName("a file written after its session was removed is deleted, not left uncounted")
        void sessionRemovedMidUpload() {
            MultipartFile racing =
                    new MockMultipartFile("file", "late.jpg", "image/jpeg", new byte[] {1}) {
                        @Override
                        public void transferTo(Path dest) throws IOException {
                            service.createSession("race");
                            service.uploadFiles("race", List.of(file("new.txt", "x")));
                            Files.write(dest, new byte[] {1});
                        }
                    };

            service.createSession("race");
            assertThrows(IOException.class, () -> service.uploadFiles("race", List.of(racing)));

            assertFalse(Files.exists(tempDir.resolve("race").resolve("late.jpg")));
            assertTrue(Files.exists(tempDir.resolve("race").resolve("new.txt")));
            assertEquals(1L, storedBytes());
        }

        @Test
        @DisplayName("same-name uploads in flight together get distinct files and byte counts")
        void concurrentSameNameUploads() throws IOException {
            MultipartFile outer =
                    new MockMultipartFile("file", "dup.jpg", "image/jpeg", new byte[] {1}) {
                        @Override
                        public void transferTo(Path dest) throws IOException {
                            service.uploadFiles("same", List.of(sized("dup.jpg", 10)));
                            Files.write(dest, new byte[] {1});
                        }
                    };

            service.createSession("same");
            service.uploadFiles("same", List.of(outer));

            assertEquals(
                    List.of("dup-1.jpg", "dup.jpg"),
                    service.getSessionFiles("same").stream()
                            .map(FileMetadata::getFilename)
                            .toList());
            assertEquals(11L, storedBytes());
            service.getFile("same", "dup.jpg");
            service.deleteFileAfterDownload("same", "dup.jpg");
            assertEquals(10L, storedBytes());
        }

        @Test
        @DisplayName("a failed write removes the file and its reservation")
        void failedWriteRemovesFile() {
            MultipartFile failing =
                    new MockMultipartFile("file", "bad.jpg", "image/jpeg", new byte[] {1}) {
                        @Override
                        public void transferTo(Path dest) throws IOException {
                            throw new IOException("disk full");
                        }
                    };

            service.createSession("fail");
            assertThrows(IOException.class, () -> service.uploadFiles("fail", List.of(failing)));

            assertFalse(Files.exists(tempDir.resolve("fail").resolve("bad.jpg")));
            assertEquals(0L, storedBytes());
        }

        private void fillSession(String sessionId, long bytes) throws IOException {
            List<MultipartFile> files = new ArrayList<>();
            for (int i = 0; bytes > 0; i++) {
                long size = Math.min(bytes, MAX_FILE);
                files.add(sized("f" + i + ".jpg", size));
                bytes -= size;
            }
            service.createSession(sessionId);
            service.uploadFiles(sessionId, files);
        }

        private void fillServer() throws IOException {
            long remaining = MobileScannerService.MAX_TOTAL_BYTES;
            for (int i = 0; remaining > 0; i++) {
                long bytes = Math.min(remaining, MobileScannerService.MAX_SESSION_BYTES);
                fillSession("fill-" + i, bytes);
                remaining -= bytes;
            }
        }

        private long storedBytes() {
            Long total = ReflectionTestUtils.invokeMethod(service, "totalStoredBytes");
            assertNotNull(total);
            return total;
        }
    }

    /** A one-byte file that reports {@code size}, so caps can be tested without large writes. */
    private MultipartFile sized(String name, long size) {
        return new MockMultipartFile("file", name, "image/jpeg", new byte[] {1}) {
            @Override
            public long getSize() {
                return size;
            }
        };
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
     * Reaches into the internal SessionData for a given session and forces its createdAt, used to
     * deterministically simulate expiry without sleeping.
     */
    @SuppressWarnings("unchecked")
    private void forceCreatedAt(String sessionId, long createdAt) {
        java.util.Map<String, Object> sessions =
                (java.util.Map<String, Object>)
                        ReflectionTestUtils.getField(service, "activeSessions");
        assertNotNull(sessions);
        Object sessionData = sessions.get(sessionId);
        assertNotNull(sessionData, "session not found: " + sessionId);
        ReflectionTestUtils.setField(sessionData, "createdAt", createdAt);
    }
}
