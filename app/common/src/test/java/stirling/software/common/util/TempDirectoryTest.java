package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * Unit tests for {@link TempDirectory}. Assumption: TempFileManager has methods
 * createTempDirectory() and deleteTempDirectory(Path).
 */
class TempDirectoryTest {

    @Test
    @DisplayName("should create temp directory and return correct path info")
    void shouldReturnCorrectPathInfo() throws IOException {
        TempFileManager manager = mock(TempFileManager.class);
        Path tempPath = Files.createTempDirectory("testDir");
        when(manager.createTempDirectory()).thenReturn(tempPath);

        try (TempDirectory tempDir = new TempDirectory(manager)) {
            assertEquals(
                    tempPath,
                    tempDir.getPath(),
                    "getPath should return the created directory path");
            assertEquals(
                    tempPath.toAbsolutePath().toString(),
                    tempDir.getAbsolutePath(),
                    "getAbsolutePath should return absolute path");
            assertTrue(tempDir.exists(), "exists should return true when directory exists");
            assertTrue(
                    tempDir.toString().contains(tempPath.toAbsolutePath().toString()),
                    "toString should include the absolute path");
        }
    }

    @Test
    @DisplayName("should call deleteTempDirectory on close")
    void shouldDeleteTempDirectoryOnClose() throws IOException {
        TempFileManager manager = mock(TempFileManager.class);
        Path tempPath = Files.createTempDirectory("testDir");
        when(manager.createTempDirectory()).thenReturn(tempPath);

        try (TempDirectory tempDir = new TempDirectory(manager)) {
            // do nothing
        }

        ArgumentCaptor<Path> captor = ArgumentCaptor.forClass(Path.class);
        verify(manager, times(1)).deleteTempDirectory(captor.capture());
        assertEquals(
                tempPath,
                captor.getValue(),
                "deleteTempDirectory should be called with the created path");
    }

    @Test
    @DisplayName("should handle multiple close calls without exception")
    void shouldHandleMultipleCloseCalls() throws IOException {
        TempFileManager manager = mock(TempFileManager.class);
        Path tempPath = Files.createTempDirectory("testDir");
        when(manager.createTempDirectory()).thenReturn(tempPath);

        TempDirectory tempDir = new TempDirectory(manager);
        tempDir.close();
        assertDoesNotThrow(tempDir::close, "Second close should not throw exception");
    }

    @Test
    @DisplayName("should return false for exists if directory does not exist")
    void shouldReturnFalseIfDirectoryDoesNotExist() throws IOException {
        TempFileManager manager = mock(TempFileManager.class);
        Path tempPath = Files.createTempDirectory("testDir");
        Files.delete(tempPath); // delete immediately
        when(manager.createTempDirectory()).thenReturn(tempPath);

        try (TempDirectory tempDir = new TempDirectory(manager)) {
            assertFalse(tempDir.exists(), "exists should return false when directory is missing");
        }
    }

    @Test
    @DisplayName("should throw IOException if createTempDirectory fails")
    void shouldThrowIfCreateTempDirectoryFails() throws IOException {
        TempFileManager manager = mock(TempFileManager.class);
        when(manager.createTempDirectory()).thenThrow(new IOException("Disk full"));

        IOException ex = assertThrows(IOException.class, () -> new TempDirectory(manager));
        assertEquals("Disk full", ex.getMessage(), "Exception message should be propagated");
    }
}
