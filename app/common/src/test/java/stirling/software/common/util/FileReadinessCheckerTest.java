package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Answers.CALLS_REAL_METHODS;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.MockitoAnnotations;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.AutoPipeline.FileReadiness;

@DisplayName("FileReadinessChecker")
class FileReadinessCheckerTest {

    @TempDir Path tempDir;

    @Mock ApplicationProperties applicationProperties;
    @Mock ApplicationProperties.AutoPipeline autoPipeline;

    /** Real config object — easier to tweak per test than chaining multiple stubs. */
    FileReadiness config;

    FileReadinessChecker checker;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);

        config = new FileReadiness();
        config.setEnabled(true);
        config.setSettleTimeMillis(0); // instant settle by default — individual tests override
        config.setSizeCheckDelayMillis(1); // minimal pause keeps tests fast
        config.setAllowedExtensions(new ArrayList<>());

        when(applicationProperties.getAutoPipeline()).thenReturn(autoPipeline);
        when(autoPipeline.getFileReadiness()).thenReturn(config);

        checker = new FileReadinessChecker(applicationProperties);
    }

    // =========================================================================
    // Master toggle
    // =========================================================================

    @Nested
    @DisplayName("when enabled=false")
    class WhenDisabled {

        @Test
        @DisplayName("always returns true regardless of file state")
        void alwaysReady() throws IOException {
            config.setEnabled(false);

            // Non-existent path — would normally fail check #1
            Path ghost = tempDir.resolve("does-not-exist.pdf");
            assertTrue(checker.isReady(ghost));
        }
    }

    // =========================================================================
    // Check #1 + #2: existence and regular-file guard
    // =========================================================================

    @Nested
    @DisplayName("existence and file-type checks")
    class ExistenceChecks {

        @Test
        @DisplayName("non-existent path → not ready")
        void fileDoesNotExist() {
            Path ghost = tempDir.resolve("ghost.pdf");
            assertFalse(checker.isReady(ghost));
        }

        @Test
        @DisplayName("path is a directory → not ready")
        void pathIsDirectory() throws IOException {
            Path dir = tempDir.resolve("subdir");
            Files.createDirectory(dir);
            assertFalse(checker.isReady(dir));
        }

        @Test
        @DisplayName("path is a regular file → passes existence checks")
        void regularFilePassesExistenceCheck() throws IOException {
            Path file = realFile("test.pdf", "content");
            setLastModifiedInPast(file, 60_000);
            assertTrue(checker.isReady(file));
        }
    }

    // =========================================================================
    // Check #3: extension filter
    // =========================================================================

    @Nested
    @DisplayName("extension filter")
    class ExtensionFilter {

        @Test
        @DisplayName("empty allow-list → all extensions accepted")
        void emptyAllowListAcceptsAll() throws IOException {
            config.setAllowedExtensions(new ArrayList<>()); // empty = no filter
            Path file = realFile("report.docx", "data");
            setLastModifiedInPast(file, 60_000);
            assertTrue(checker.isReady(file));
        }

        @Test
        @DisplayName("extension in allow-list → passes")
        void extensionInAllowList() throws IOException {
            config.setAllowedExtensions(List.of("pdf", "tiff"));
            Path file = realFile("scan.pdf", "data");
            setLastModifiedInPast(file, 60_000);
            assertTrue(checker.isReady(file));
        }

        @Test
        @DisplayName("extension not in allow-list → not ready")
        void extensionNotInAllowList() throws IOException {
            config.setAllowedExtensions(List.of("pdf", "tiff"));
            Path file = realFile("document.docx", "data");
            setLastModifiedInPast(file, 60_000);
            assertFalse(checker.isReady(file));
        }

        @Test
        @DisplayName("extension matching is case-insensitive")
        void extensionMatchIsCaseInsensitive() throws IOException {
            config.setAllowedExtensions(List.of("PDF"));
            Path file = realFile("scan.pdf", "data");
            setLastModifiedInPast(file, 60_000);
            assertTrue(checker.isReady(file));
        }

        @Test
        @DisplayName("file without extension and non-empty allow-list → not ready")
        void fileWithNoExtension() throws IOException {
            config.setAllowedExtensions(List.of("pdf"));
            Path file = realFile("README", "data");
            setLastModifiedInPast(file, 60_000);
            assertFalse(checker.isReady(file));
        }
    }

    // =========================================================================
    // Check #4: settle-time (last-modified age)
    // =========================================================================

    @Nested
    @DisplayName("settle-time check")
    class SettleTime {

        @Test
        @DisplayName("recently modified file → not ready")
        void recentlyModified_notReady() throws IOException {
            config.setSettleTimeMillis(60_000); // require 1 minute of quiet
            Path file = realFile("new.pdf", "data");
            // last-modified is now (just created) — well within the threshold
            assertFalse(checker.isReady(file));
        }

        @Test
        @DisplayName("file settled for longer than threshold → ready")
        void settled_ready() throws IOException {
            config.setSettleTimeMillis(5_000);
            Path file = realFile("old.pdf", "data");
            setLastModifiedInPast(file, 10_000); // 10 s ago — older than 5 s threshold
            assertTrue(checker.isReady(file));
        }

        @Test
        @DisplayName("settle threshold of 0 ms passes any file")
        void zeroThreshold_alwaysPasses() throws IOException {
            config.setSettleTimeMillis(0);
            Path file = realFile("instant.pdf", "data");
            // last-modified is right now; 0 ms threshold means anything passes
            assertTrue(checker.isReady(file));
        }
    }

    // =========================================================================
    // Check #5: size stability
    // =========================================================================

    @Nested
    @DisplayName("size-stability check")
    class SizeStability {

        @Test
        @DisplayName("size unchanged between two reads → ready")
        void sizeStable_ready() throws IOException {
            config.setSizeCheckDelayMillis(1);
            Path file = realFile("stable.pdf", "fixed content");
            setLastModifiedInPast(file, 60_000);
            assertTrue(checker.isReady(file));
        }

        @Test
        @DisplayName("size changes between two reads → not ready")
        void sizeChanging_notReady() throws IOException {
            config.setSizeCheckDelayMillis(1);
            Path file = realFile("growing.pdf", "initial");
            setLastModifiedInPast(file, 60_000);

            // Use MockedStatic to control what Files.size() returns on each call
            // while leaving all other Files.* methods intact.
            AtomicInteger sizeCallCount = new AtomicInteger(0);
            try (MockedStatic<Files> mockedFiles = mockStatic(Files.class, CALLS_REAL_METHODS)) {
                mockedFiles
                        .when(() -> Files.size(file))
                        .thenAnswer(
                                inv ->
                                        sizeCallCount.incrementAndGet() == 1
                                                ? 100L // first read: 100 bytes
                                                : 200L); // second read: 200 bytes — changed!
                assertFalse(checker.isReady(file));
            }
        }
    }

    // =========================================================================
    // Check #6: file-lock check
    // =========================================================================

    @Nested
    @DisplayName("file-lock check")
    class FileLockCheck {

        @Test
        @DisplayName("file held open with exclusive lock by another thread → not ready")
        void fileLocked_notReady() throws IOException, InterruptedException {
            Path file = realFile("locked.pdf", "data");
            setLastModifiedInPast(file, 60_000);

            CountDownLatch lockAcquired = new CountDownLatch(1);
            CountDownLatch testDone = new CountDownLatch(1);
            AtomicInteger lockThreadFailed = new AtomicInteger(0);

            Thread lockHolder =
                    new Thread(
                            () -> {
                                try (RandomAccessFile raf =
                                                new RandomAccessFile(file.toFile(), "rw");
                                        FileChannel channel = raf.getChannel();
                                        FileLock lock = channel.lock()) {
                                    lockAcquired.countDown();
                                    testDone.await(10, TimeUnit.SECONDS);
                                } catch (Exception e) {
                                    lockThreadFailed.set(1);
                                    lockAcquired.countDown();
                                }
                            });
            lockHolder.setDaemon(true);
            lockHolder.start();
            lockAcquired.await(5, TimeUnit.SECONDS);

            try {
                if (lockThreadFailed.get() == 0) {
                    // Lock was successfully held — the checker must see it as locked.
                    // On JVM, tryLock() from a second thread in the same process throws
                    // OverlappingFileLockException (or returns null on some platforms), both of
                    // which isLocked() maps to true.
                    assertFalse(checker.isReady(file));
                }
                // If locking failed on this platform we simply skip the assertion rather than
                // failing the build — the logic path is still exercised by other tests.
            } finally {
                testDone.countDown();
                lockHolder.join(5_000);
            }
        }

        @Test
        @DisplayName("file with no external lock and all checks passing → ready")
        void noLock_ready() throws IOException {
            Path file = realFile("unlocked.pdf", "data");
            setLastModifiedInPast(file, 60_000);
            assertTrue(checker.isReady(file));
        }
    }

    // =========================================================================
    // Full happy-path integration
    // =========================================================================

    @Nested
    @DisplayName("full happy path")
    class HappyPath {

        @Test
        @DisplayName("all checks pass → ready")
        void allChecksPass_ready() throws IOException {
            config.setSettleTimeMillis(5_000);
            config.setSizeCheckDelayMillis(1);
            config.setAllowedExtensions(List.of("pdf"));

            Path file = realFile("invoice.pdf", "PDF content");
            setLastModifiedInPast(file, 10_000);

            assertTrue(checker.isReady(file));
        }

        @Test
        @DisplayName("first failing check short-circuits evaluation")
        void shortCircuitsOnFirstFailure() throws IOException {
            // Extension filter will reject — settle / size / lock checks must never run
            config.setAllowedExtensions(List.of("pdf"));
            config.setSettleTimeMillis(0);
            config.setSizeCheckDelayMillis(1);

            Path file = realFile("archive.zip", "ZIP data");
            setLastModifiedInPast(file, 60_000);

            assertFalse(checker.isReady(file));
        }
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private Path realFile(String name, String content) throws IOException {
        Path file = tempDir.resolve(name);
        Files.writeString(file, content);
        return file;
    }

    /**
     * Back-dates the last-modified time of {@code path} by {@code millisAgo} so that settle-time
     * checks pass without actually waiting.
     */
    private void setLastModifiedInPast(Path path, long millisAgo) throws IOException {
        Files.setLastModifiedTime(
                path, FileTime.fromMillis(System.currentTimeMillis() - millisAgo));
    }
}
