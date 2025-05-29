package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

/**
 * Tests for the TempFileCleanupService, focusing on its pattern-matching and cleanup logic.
 */
public class TempFileCleanupServiceTest {

    @TempDir
    Path tempDir;

    @Mock
    private TempFileRegistry registry;

    @Mock
    private TempFileManager tempFileManager;

    @InjectMocks
    private TempFileCleanupService cleanupService;

    private Path systemTempDir;
    private Path customTempDir;
    private Path libreOfficeTempDir;

    @BeforeEach
    public void setup() throws IOException {
        MockitoAnnotations.openMocks(this);

        // Create test directories
        systemTempDir = tempDir.resolve("systemTemp");
        customTempDir = tempDir.resolve("customTemp");
        libreOfficeTempDir = tempDir.resolve("libreOfficeTemp");

        Files.createDirectories(systemTempDir);
        Files.createDirectories(customTempDir);
        Files.createDirectories(libreOfficeTempDir);

        // Configure service with our test directories
        ReflectionTestUtils.setField(cleanupService, "systemTempDir", systemTempDir.toString());
        ReflectionTestUtils.setField(cleanupService, "customTempDirectory", customTempDir.toString());
        ReflectionTestUtils.setField(cleanupService, "libreOfficeTempDir", libreOfficeTempDir.toString());
        ReflectionTestUtils.setField(cleanupService, "machineType", "Docker"); // Test in container mode
        ReflectionTestUtils.setField(cleanupService, "performStartupCleanup", false); // Disable auto-startup cleanup
        
        when(tempFileManager.getMaxAgeMillis()).thenReturn(3600000L); // 1 hour
    }

    @Test
    public void testScheduledCleanup_RegisteredFiles() {
        // Arrange
        when(tempFileManager.cleanupOldTempFiles(anyLong())).thenReturn(5); // 5 files deleted
        Set<Path> registeredDirs = new HashSet<>();
        registeredDirs.add(tempDir.resolve("registeredDir"));
        when(registry.getTempDirectories()).thenReturn(registeredDirs);

        // Act
        cleanupService.scheduledCleanup();

        // Assert
        verify(tempFileManager).cleanupOldTempFiles(anyLong());
        verify(registry, times(1)).getTempDirectories();
    }

    @Test
    public void testCleanupTempFilePatterns() throws IOException {
        // Arrange - Create various temp files
        Path ourTempFile1 = Files.createFile(systemTempDir.resolve("output_123.pdf"));
        Path ourTempFile2 = Files.createFile(systemTempDir.resolve("compressedPDF456.pdf"));
        Path ourTempFile3 = Files.createFile(customTempDir.resolve("stirling-pdf-789.tmp"));
        Path ourTempFile4 = Files.createFile(customTempDir.resolve("pdf-save-123-456.tmp"));
        Path ourTempFile5 = Files.createFile(libreOfficeTempDir.resolve("input_file.pdf"));
        
        // System temp files that should be cleaned in container mode
        Path sysTempFile1 = Files.createFile(systemTempDir.resolve("lu123abc.tmp"));
        Path sysTempFile2 = Files.createFile(customTempDir.resolve("ocr_process123"));
        Path sysTempFile3 = Files.createFile(customTempDir.resolve("tmp_upload.tmp"));
        
        // Files that should be preserved
        Path jettyFile1 = Files.createFile(systemTempDir.resolve("jetty-123.tmp"));
        Path jettyFile2 = Files.createFile(systemTempDir.resolve("something-with-jetty-inside.tmp"));
        Path regularFile = Files.createFile(systemTempDir.resolve("important.txt"));
        
        // Create a nested directory with temp files
        Path nestedDir = Files.createDirectories(systemTempDir.resolve("nested"));
        Path nestedTempFile = Files.createFile(nestedDir.resolve("output_nested.pdf"));
        
        // Empty file (special case)
        Path emptyFile = Files.createFile(systemTempDir.resolve("empty.tmp"));
        
        // Configure mock registry to say these files aren't registered
        when(registry.contains(any(File.class))).thenReturn(false);
        
        // Create a file older than threshold
        Path oldFile = Files.createFile(systemTempDir.resolve("output_old.pdf"));
        Files.setLastModifiedTime(oldFile, FileTime.from(      Files.getLastModifiedTime(oldFile).toMillis() - 5000000, TimeUnit.MILLISECONDS));

        // Act
        invokeCleanupDirectory(systemTempDir, true, 0, 3600000);
        invokeCleanupDirectory(customTempDir, true, 0, 3600000);
        invokeCleanupDirectory(libreOfficeTempDir, true, 0, 3600000);

        // Assert - Our temp files and system temp files should be deleted (if old enough)
        assertFalse(Files.exists(oldFile), "Old temp file should be deleted");
        assertTrue(Files.exists(ourTempFile1), "Recent temp file should be preserved");
        assertTrue(Files.exists(sysTempFile1), "Recent system temp file should be preserved");
        
        // Jetty files and regular files should never be deleted
        assertTrue(Files.exists(jettyFile1), "Jetty file should be preserved");
        assertTrue(Files.exists(jettyFile2), "File with jetty in name should be preserved");
        assertTrue(Files.exists(regularFile), "Regular file should be preserved");
    }

    @Test
    public void testEmptyFileHandling() throws IOException {
        // Arrange - Create an empty file
        Path emptyFile = Files.createFile(systemTempDir.resolve("empty.tmp"));
        // Make it "old enough" to be deleted (>5 minutes)
        Files.setLastModifiedTime(emptyFile, FileTime.from(      Files.getLastModifiedTime(emptyFile).toMillis() - 6 * 60 * 1000, TimeUnit.MILLISECONDS));
    
        
        // Configure mock registry to say this file isn't registered
        when(registry.contains(any(File.class))).thenReturn(false);

        // Act
        invokeCleanupDirectory(systemTempDir, true, 0, 3600000);

        // Assert
        assertFalse(Files.exists(emptyFile), "Empty file older than 5 minutes should be deleted");
    }

    @Test
    public void testRecursiveDirectoryCleaning() throws IOException {
        // Arrange - Create a nested directory structure with temp files
        Path dir1 = Files.createDirectories(systemTempDir.resolve("dir1"));
        Path dir2 = Files.createDirectories(dir1.resolve("dir2"));
        Path dir3 = Files.createDirectories(dir2.resolve("dir3"));
        
        Path tempFile1 = Files.createFile(dir1.resolve("output_1.pdf"));
        Path tempFile2 = Files.createFile(dir2.resolve("output_2.pdf"));
        Path tempFile3 = Files.createFile(dir3.resolve("output_3.pdf"));
        
        // Make the deepest file old enough to be deleted
        Files.setLastModifiedTime(tempFile3, FileTime.from(      Files.getLastModifiedTime(tempFile3).toMillis() - 5000000, TimeUnit.MILLISECONDS));
        
        // Configure mock registry to say these files aren't registered
        when(registry.contains(any(File.class))).thenReturn(false);

        // Act
        invokeCleanupDirectory(systemTempDir, true, 0, 3600000);

        // Assert
        assertTrue(Files.exists(tempFile1), "Recent temp file should be preserved");
        assertTrue(Files.exists(tempFile2), "Recent temp file should be preserved");
        assertFalse(Files.exists(tempFile3), "Old temp file in nested directory should be deleted");
    }

    /**
     * Helper method to invoke the private cleanupDirectory method using reflection
     */
    private int invokeCleanupDirectory(Path directory, boolean containerMode, int depth, long maxAgeMillis) 
            throws IOException {
        try {
            var method = TempFileCleanupService.class.getDeclaredMethod(
                    "cleanupDirectory", Path.class, boolean.class, int.class, long.class);
            method.setAccessible(true);
            return (int) method.invoke(cleanupService, directory, containerMode, depth, maxAgeMillis);
        } catch (Exception e) {
            throw new RuntimeException("Error invoking cleanupDirectory", e);
        }
    }
}