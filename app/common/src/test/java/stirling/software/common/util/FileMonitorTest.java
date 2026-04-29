package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.function.Predicate;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.common.configuration.RuntimePathConfig;

class FileMonitorTest {

    @TempDir Path tempDir;

    private FileMonitor createFileMonitor(Path watchDir) throws IOException {
        Predicate<Path> acceptAll = path -> true;
        RuntimePathConfig runtimePathConfig = mock(RuntimePathConfig.class);
        when(runtimePathConfig.getPipelineWatchedFoldersPaths())
                .thenReturn(List.of(watchDir.toString()));
        return new FileMonitor(acceptAll, runtimePathConfig);
    }

    @Test
    void testConstructor_withValidDirectory() throws IOException {
        FileMonitor monitor = createFileMonitor(tempDir);
        assertNotNull(monitor);
    }

    @Test
    void testConstructor_withNonExistentDirectory() throws IOException {
        Path nonExistent = tempDir.resolve("does_not_exist");
        Predicate<Path> acceptAll = path -> true;
        RuntimePathConfig config = mock(RuntimePathConfig.class);
        when(config.getPipelineWatchedFoldersPaths()).thenReturn(List.of(nonExistent.toString()));

        // Should not throw - just logs an error about non-existent path
        FileMonitor monitor = new FileMonitor(acceptAll, config);
        assertNotNull(monitor);
    }

    @Test
    void testConstructor_withEmptyWatchedFolders() throws IOException {
        Predicate<Path> acceptAll = path -> true;
        RuntimePathConfig config = mock(RuntimePathConfig.class);
        when(config.getPipelineWatchedFoldersPaths()).thenReturn(List.of());

        FileMonitor monitor = new FileMonitor(acceptAll, config);
        assertNotNull(monitor);
    }

    @Test
    void testTrackFiles_noEventsDoesNotThrow() throws IOException {
        FileMonitor monitor = createFileMonitor(tempDir);
        // Should not throw even when no events have occurred
        assertDoesNotThrow(() -> monitor.trackFiles());
    }

    @Test
    void testIsFileReadyForProcessing_nonExistentFile() throws IOException {
        FileMonitor monitor = createFileMonitor(tempDir);
        Path nonExistent = tempDir.resolve("nonexistent.pdf");

        // Non-existent file should not be ready (file lock check will fail)
        boolean ready = monitor.isFileReadyForProcessing(nonExistent);
        assertFalse(ready, "Non-existent file should not be ready for processing");
    }

    @Test
    void testIsFileReadyForProcessing_existingFile() throws IOException, InterruptedException {
        FileMonitor monitor = createFileMonitor(tempDir);
        Path testFile = tempDir.resolve("test.pdf");
        Files.writeString(testFile, "test content");

        // Run trackFiles to process any events
        monitor.trackFiles();

        // The file might or might not be ready depending on timing,
        // but calling the method should not throw
        assertDoesNotThrow(() -> monitor.isFileReadyForProcessing(testFile));
    }

    @Test
    void testTrackFiles_afterFileCreation() throws IOException {
        FileMonitor monitor = createFileMonitor(tempDir);

        // Create a file in the watched directory
        Path testFile = tempDir.resolve("newfile.txt");
        Files.writeString(testFile, "hello");

        // Track files should process the creation event
        assertDoesNotThrow(() -> monitor.trackFiles());
    }

    @Test
    void testConstructor_withPathFilter() throws IOException {
        // Filter that rejects all paths
        Predicate<Path> rejectAll = path -> false;
        RuntimePathConfig config = mock(RuntimePathConfig.class);
        when(config.getPipelineWatchedFoldersPaths()).thenReturn(List.of(tempDir.toString()));

        FileMonitor monitor = new FileMonitor(rejectAll, config);
        assertNotNull(monitor);
    }
}
