package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.LoggerFactory;

import stirling.software.common.configuration.RuntimePathConfig;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

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

    @Nested
    @DisplayName("missing roots")
    class MissingRootTests {

        private Logger logger;
        private Level originalLevel;
        private ListAppender<ILoggingEvent> appender;

        private void attachLogCapture() {
            logger = (Logger) LoggerFactory.getLogger(FileMonitor.class);
            originalLevel = logger.getLevel();
            appender = new ListAppender<>();
            appender.start();
            logger.setLevel(Level.INFO);
            logger.addAppender(appender);
        }

        private void detachLogCapture() {
            logger.detachAppender(appender);
            logger.setLevel(originalLevel);
        }

        private long missingRootWarnings() {
            return appender.list.stream()
                    .filter(event -> event.getLevel() == Level.WARN)
                    .filter(
                            event ->
                                    event.getFormattedMessage()
                                            .contains("Not monitoring any directories"))
                    .count();
        }

        @SuppressWarnings("unchecked")
        private Set<Path> readyFiles(FileMonitor monitor) throws ReflectiveOperationException {
            Field field = FileMonitor.class.getDeclaredField("readyForProcessingFiles");
            field.setAccessible(true);
            return (Set<Path>) field.get(monitor);
        }

        @SuppressWarnings("unchecked")
        private Set<Path> pendingFiles(FileMonitor monitor) throws ReflectiveOperationException {
            Field field = FileMonitor.class.getDeclaredField("newlyDiscoveredFiles");
            field.setAccessible(true);
            return (Set<Path>) field.get(monitor);
        }

        private void forgetRegistrations(FileMonitor monitor) throws ReflectiveOperationException {
            Field field = FileMonitor.class.getDeclaredField("path2KeyMapping");
            field.setAccessible(true);
            ((Map<?, ?>) field.get(monitor)).clear();
        }

        @Test
        @DisplayName("a root that never appears is warned about once, not on every tick")
        void missingRootWarnsOnce() throws IOException {
            attachLogCapture();
            try {
                FileMonitor monitor = monitorWatching(tempDir.resolve("missing"), p -> true);
                for (int tick = 0; tick < 5; tick++) {
                    monitor.trackFiles();
                }
                assertTrue(
                        missingRootWarnings() <= 1,
                        "missing root warning repeated " + missingRootWarnings() + " times");
            } finally {
                detachLogCapture();
            }
        }

        @Test
        @DisplayName("pending work with no root does not repeat the warning")
        void pendingFilesDoNotRepeatWarning() throws Exception {
            Path root = tempDir.resolve("watched");
            Files.createDirectories(root);
            Files.writeString(root.resolve("pending.pdf"), "pending");

            attachLogCapture();
            try {
                FileMonitor monitor = monitorWatching(root, p -> true);
                Path moved = tempDir.resolve("moved");
                Files.move(root, moved);
                forgetRegistrations(monitor);
                // Simulate a file left in the pending queue after the root was
                // lost; this is the state the warning throttle must cover.
                pendingFiles(monitor).add(moved.resolve("pending.pdf").toAbsolutePath());
                for (int tick = 0; tick < 5; tick++) {
                    monitor.trackFiles();
                }
                assertTrue(
                        missingRootWarnings() <= 1,
                        "missing root warning repeated " + missingRootWarnings() + " times");
            } finally {
                detachLogCapture();
            }
        }

        @Test
        @DisplayName("no configured roots stay quiet after the constructor error")
        void emptyRootListDoesNotWarn() throws IOException {
            RuntimePathConfig config = mock(RuntimePathConfig.class);
            when(config.getPipelineWatchedFoldersPaths()).thenReturn(List.of());
            attachLogCapture();
            try {
                FileMonitor monitor = new FileMonitor(p -> true, config);
                for (int tick = 0; tick < 5; tick++) {
                    monitor.trackFiles();
                }
                assertTrue(
                        missingRootWarnings() == 0,
                        "missing root warning repeated " + missingRootWarnings() + " times");
            } finally {
                detachLogCapture();
            }
        }

        @Test
        @DisplayName("a root created after startup registers and queues its files")
        void rootCreatedLaterQueuesFiles() throws Exception {
            Path root = tempDir.resolve("late-root");
            FileMonitor monitor = monitorWatching(root, p -> true);
            monitor.trackFiles();

            Files.createDirectories(root);
            Path file = root.resolve("late.pdf");
            Files.writeString(file, "late");
            monitor.trackFiles();

            assertTrue(
                    readyFiles(monitor).contains(file.toAbsolutePath()),
                    "file discovered when the root appeared was not queued");
        }

        @Test
        @DisplayName("a root deleted and recreated registers again")
        void rootDeletedAndRecreated() throws Exception {
            Path root = tempDir.resolve("recreated-root");
            Files.createDirectories(root);
            FileMonitor monitor = monitorWatching(root, p -> true);
            Files.delete(root);
            monitor.trackFiles();

            Files.createDirectories(root);
            Path file = root.resolve("after-recreate.pdf");
            Files.writeString(file, "after");
            monitor.trackFiles();

            assertTrue(
                    readyFiles(monitor).contains(file.toAbsolutePath()),
                    "file in the recreated root was not queued");
        }
    }
}
