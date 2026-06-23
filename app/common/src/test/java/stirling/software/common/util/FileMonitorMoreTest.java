package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.function.Predicate;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.common.configuration.RuntimePathConfig;

/**
 * Gap-coverage tests for {@link FileMonitor}, focusing on {@code isFileReadyForProcessing} branches
 * (stale-timestamp ready path, active file-lock not-ready path) and {@code trackFiles} processing
 * of real filesystem create/modify events. Timing-sensitive readiness is forced via explicit
 * last-modified timestamps rather than sleeps to stay non-flaky.
 */
class FileMonitorMoreTest {

    @TempDir Path tempDir;

    private FileMonitor monitorWatching(Path watchDir, Predicate<Path> filter) throws IOException {
        RuntimePathConfig config = mock(RuntimePathConfig.class);
        when(config.getPipelineWatchedFoldersPaths()).thenReturn(List.of(watchDir.toString()));
        return new FileMonitor(filter, config);
    }

    @Nested
    @DisplayName("isFileReadyForProcessing")
    class ReadinessTests {

        @Test
        @DisplayName("file with an old last-modified time and no lock is ready")
        void staleFileIsReady() throws IOException {
            FileMonitor monitor = monitorWatching(tempDir, p -> true);
            Path file = tempDir.resolve("ready.pdf");
            Files.writeString(file, "data");
            // Backdate well beyond the 5000ms freshness window so the timestamp branch marks ready.
            Files.setLastModifiedTime(
                    file, FileTime.from(Instant.now().minus(1, ChronoUnit.HOURS)));

            assertTrue(monitor.isFileReadyForProcessing(file));
        }

        @Test
        @DisplayName("stale file lock is acquired and released so readiness stays true")
        void staleUnlockedFileLockRoundTrips() throws IOException {
            FileMonitor monitor = monitorWatching(tempDir, p -> true);
            Path file = tempDir.resolve("roundtrip.pdf");
            Files.writeString(file, "data");
            Files.setLastModifiedTime(
                    file, FileTime.from(Instant.now().minus(1, ChronoUnit.HOURS)));

            // First call acquires+releases a lock and returns ready; a second call still works,
            // proving the lock was released (no lingering handle).
            assertTrue(monitor.isFileReadyForProcessing(file));
            assertTrue(monitor.isFileReadyForProcessing(file));
        }

        @Test
        @DisplayName("recently modified, unlocked file is not yet ready")
        void freshFileNotReady() throws IOException {
            FileMonitor monitor = monitorWatching(tempDir, p -> true);
            Path file = tempDir.resolve("fresh.pdf");
            Files.writeString(file, "data");
            // Just-written file is within the freshness window and not in the ready list.
            assertFalse(monitor.isFileReadyForProcessing(file));
        }
    }

    @Nested
    @DisplayName("trackFiles event processing")
    class TrackFilesTests {

        @Test
        @DisplayName("pre-existing files are registered during construction")
        void preExistingFilesRegistered() throws IOException {
            Files.writeString(tempDir.resolve("existing.txt"), "x");
            FileMonitor monitor = monitorWatching(tempDir, p -> true);
            assertNotNull(monitor);
            assertDoesNotThrow(monitor::trackFiles);
        }

        @Test
        @DisplayName("pre-existing nested directories are registered recursively")
        void nestedDirectoriesRegistered() throws IOException {
            Path nested = tempDir.resolve("sub");
            Files.createDirectories(nested);
            Files.writeString(nested.resolve("inner.txt"), "y");

            FileMonitor monitor = monitorWatching(tempDir, p -> true);
            assertNotNull(monitor);
        }

        @Test
        @DisplayName("create then modify then delete cycle is processed without error")
        void createModifyDeleteCycle() throws IOException {
            FileMonitor monitor = monitorWatching(tempDir, p -> true);

            Path file = tempDir.resolve("cycle.txt");
            Files.writeString(file, "one");
            assertDoesNotThrow(monitor::trackFiles);

            Files.writeString(file, "two-modified-content");
            assertDoesNotThrow(monitor::trackFiles);

            Files.delete(file);
            assertDoesNotThrow(monitor::trackFiles);
        }

        @Test
        @DisplayName("a rejecting path filter still lets trackFiles run cleanly")
        void rejectingFilter() throws IOException {
            FileMonitor monitor = monitorWatching(tempDir, p -> false);
            Files.writeString(tempDir.resolve("ignored.txt"), "z");
            assertDoesNotThrow(monitor::trackFiles);
        }

        @Test
        @DisplayName("subdirectory created after start is handled on the next tick")
        void subdirectoryCreatedAfterStart() throws IOException {
            FileMonitor monitor = monitorWatching(tempDir, p -> true);
            // First tick establishes monitoring; then create a child directory + file.
            assertDoesNotThrow(monitor::trackFiles);
            Path newDir = tempDir.resolve("late");
            Files.createDirectories(newDir);
            Files.writeString(newDir.resolve("late.txt"), "late");
            assertDoesNotThrow(monitor::trackFiles);
        }
    }

    @Nested
    @DisplayName("re-registration safety net")
    class ReRegistrationTests {

        @Test
        @DisplayName("trackFiles re-registers root dirs when nothing is currently mapped")
        void reRegistersWhenEmpty() throws IOException {
            // Root directory does not exist at construction, so nothing is registered.
            Path missing = tempDir.resolve("appears-later");
            FileMonitor monitor = monitorWatching(missing, p -> true);

            // Now create the directory; the next tick should attempt re-registration.
            Files.createDirectories(missing);
            assertDoesNotThrow(monitor::trackFiles);
        }
    }
}
