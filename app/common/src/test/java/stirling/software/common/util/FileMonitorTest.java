package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Instant;
import java.util.function.Predicate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import stirling.software.common.configuration.RuntimePathConfig;

@ExtendWith(MockitoExtension.class)
@DisplayName("FileMonitor Tests")
class FileMonitorTest {

    @TempDir Path tempDir;

    @Mock private RuntimePathConfig runtimePathConfig;

    @Mock private Predicate<Path> pathFilter;

    private FileMonitor fileMonitor;

    @BeforeEach
    void setUp() throws IOException {
        when(runtimePathConfig.getPipelineWatchedFoldersPath()).thenReturn(tempDir.toString());

        // This mock is used in all tests except testPathFilter
        // We use lenient to avoid UnnecessaryStubbingException in that test
        Mockito.lenient().when(pathFilter.test(any())).thenReturn(true);

        fileMonitor = new FileMonitor(pathFilter, runtimePathConfig);
    }

    @Nested
    @DisplayName("File Readiness Tests")
    class FileReadinessTests {

        @Test
        @DisplayName("Returns true when file was last modified more than 5 seconds ago")
        void testIsFileReadyForProcessing_OldFile() throws IOException {
            // Create a test file
            Path testFile = tempDir.resolve("test-file.txt");
            Files.write(testFile, "test content".getBytes());

            // Set modified time to 10 seconds ago
            Files.setLastModifiedTime(testFile, FileTime.from(Instant.now().minusMillis(10000)));

            // Assert
            assertTrue(fileMonitor.isFileReadyForProcessing(testFile), "Old file should be ready for processing");
        }

        @Test
        @DisplayName("Returns false for files modified very recently")
        void testIsFileReadyForProcessing_RecentFile() throws IOException {
            // Create a test file
            Path testFile = tempDir.resolve("recent-file.txt");
            Files.write(testFile, "test content".getBytes());

            // Set modified time to now
            Files.setLastModifiedTime(testFile, FileTime.from(Instant.now()));

            // Assert
            assertFalse(fileMonitor.isFileReadyForProcessing(testFile), "Recent file should not be ready for processing");
        }

        @Test
        @DisplayName("Returns false for non-existent file paths")
        void testIsFileReadyForProcessing_NonExistentFile() {
            // Create a path to a file that doesn't exist
            Path nonExistentFile = tempDir.resolve("non-existent-file.txt");

            // Assert
            assertFalse(fileMonitor.isFileReadyForProcessing(nonExistentFile), "Non-existent file should not be ready");
        }

        @Test
        @DisplayName("Considers properly old file ready, ignoring file locks for readiness")
        void testIsFileReadyForProcessing_LockedFile() throws IOException {
            // Create a test file
            Path testFile = tempDir.resolve("locked-file.txt");
            Files.write(testFile, "test content".getBytes());

            // Set modified time to 10 seconds ago
            Files.setLastModifiedTime(testFile, FileTime.from(Instant.now().minusMillis(10000)));

            // Assert
            assertTrue(fileMonitor.isFileReadyForProcessing(testFile), "Old file should be ready regardless of locks");
        }

        @Test
        @DisplayName("File remains ready after content update and modified time reset")
        void testIsFileReadyForProcessing_FileInUse() throws IOException {
            // Create a test file
            Path testFile = tempDir.resolve("in-use-file.txt");
            Files.write(testFile, "initial content".getBytes());

            // Set modified time to 10 seconds ago
            Files.setLastModifiedTime(testFile, FileTime.from(Instant.now().minusMillis(10000)));

            // Assert initial readiness
            assertTrue(fileMonitor.isFileReadyForProcessing(testFile), "File should be ready initially");

            // Modify file content and reset modified time to 10 seconds ago
            Files.write(testFile, "updated content".getBytes());
            Files.setLastModifiedTime(testFile, FileTime.from(Instant.now().minusMillis(10000)));

            // Assert still ready
            assertTrue(fileMonitor.isFileReadyForProcessing(testFile), "File should remain ready after update");
        }

        @Test
        @DisplayName("Handles absolute file paths correctly")
        void testIsFileReadyForProcessing_FileWithAbsolutePath() throws IOException {
            // Create a test file
            Path testFile = tempDir.resolve("absolute-path-file.txt");
            Files.write(testFile, "test content".getBytes());

            // Set modified time to 10 seconds ago
            Files.setLastModifiedTime(testFile, FileTime.from(Instant.now().minusMillis(10000)));

            // Assert
            assertTrue(fileMonitor.isFileReadyForProcessing(testFile.toAbsolutePath()), "Absolute path should be handled correctly");
        }

        @Test
        @DisplayName("Directories are never considered ready for processing")
        void testIsFileReadyForProcessing_DirectoryInsteadOfFile() throws IOException {
            // Create a test directory
            Path testDir = tempDir.resolve("test-directory");
            Files.createDirectory(testDir);

            // Set modified time to 10 seconds ago
            Files.setLastModifiedTime(testDir, FileTime.from(Instant.now().minusMillis(10000)));

            // Assert
            assertFalse(fileMonitor.isFileReadyForProcessing(testDir), "Directory should not be ready for processing");
        }
    }

    @Nested
    @DisplayName("Path Filter Tests")
    class PathFilterTests {

        @Test
        @DisplayName("File filter correctly accepts only PDF files")
        void testPathFilter() throws IOException {
            // Use a simple lambda instead of a mock for better control
            Predicate<Path> pdfFilter = path -> path.toString().endsWith(".pdf");

            // Create a new FileMonitor with the PDF filter
            FileMonitor pdfMonitor = new FileMonitor(pdfFilter, runtimePathConfig);

            // Create a PDF file
            Path pdfFile = tempDir.resolve("test.pdf");
            Files.write(pdfFile, "pdf content".getBytes());
            Files.setLastModifiedTime(pdfFile, FileTime.from(Instant.now().minusMillis(10000)));

            // Create a TXT file
            Path txtFile = tempDir.resolve("test.txt");
            Files.write(txtFile, "text content".getBytes());
            Files.setLastModifiedTime(txtFile, FileTime.from(Instant.now().minusMillis(10000)));

            // Assert
            assertTrue(pdfMonitor.isFileReadyForProcessing(pdfFile), "PDF file should be ready for processing");
            assertFalse(pdfFilter.test(txtFile), "PDF filter should reject txt files");
            assertTrue(pdfFilter.test(pdfFile), "PDF filter should accept pdf files");
        }
    }
}
