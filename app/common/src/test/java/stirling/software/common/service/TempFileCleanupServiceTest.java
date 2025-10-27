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
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.MockitoAnnotations;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

/** Tests for the TempFileCleanupService, focusing on its pattern-matching and cleanup logic. */
public class TempFileCleanupServiceTest {

    @TempDir Path tempDir;

    @Mock private TempFileRegistry registry;

    @Mock private TempFileManager tempFileManager;

    @Mock private ApplicationProperties applicationProperties;

    @Mock private ApplicationProperties.System system;

    @Mock private ApplicationProperties.TempFileManagement tempFileManagement;

    @InjectMocks private TempFileCleanupService cleanupService;

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

        // Configure ApplicationProperties mocks
        when(applicationProperties.getSystem()).thenReturn(system);
        when(system.getTempFileManagement()).thenReturn(tempFileManagement);
        when(tempFileManagement.getBaseTmpDir()).thenReturn(customTempDir.toString());
        when(tempFileManagement.getLibreofficeDir()).thenReturn(libreOfficeTempDir.toString());
        when(tempFileManagement.getSystemTempDir()).thenReturn(systemTempDir.toString());
        when(tempFileManagement.isStartupCleanup()).thenReturn(false);
        when(tempFileManagement.isCleanupSystemTemp()).thenReturn(false);
        when(tempFileManagement.getCleanupIntervalMinutes()).thenReturn(30L);

        // Set machineType using reflection (still needed for this field)
        ReflectionTestUtils.setField(cleanupService, "machineType", "Standard");

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

        // Old temporary files
        Path oldTempFile = Files.createFile(systemTempDir.resolve("output_old.pdf"));

        // System temp files that should be cleaned in container mode
        Path sysTempFile1 = Files.createFile(systemTempDir.resolve("lu123abc.tmp"));
        Path sysTempFile2 = Files.createFile(customTempDir.resolve("ocr_process123"));
        Path sysTempFile3 = Files.createFile(customTempDir.resolve("tmp_upload.tmp"));

        // Files that should be preserved
        Path jettyFile1 = Files.createFile(systemTempDir.resolve("jetty-123.tmp"));
        Path jettyFile2 =
                Files.createFile(systemTempDir.resolve("something-with-jetty-inside.tmp"));
        Path regularFile = Files.createFile(systemTempDir.resolve("important.txt"));

        // Create a nested directory with temp files
        Path nestedDir = Files.createDirectories(systemTempDir.resolve("nested"));
        Path nestedTempFile = Files.createFile(nestedDir.resolve("output_nested.pdf"));

        // Empty file (special case)
        Path emptyFile = Files.createFile(systemTempDir.resolve("empty.tmp"));

        // Configure mock registry to say these files aren't registered
        when(registry.contains(any(File.class))).thenReturn(false);

        // The set of files that will be deleted in our test
        Set<Path> deletedFiles = new HashSet<>();

        // Use MockedStatic to mock Files operations
        try (MockedStatic<Files> mockedFiles = mockStatic(Files.class)) {
            // Mock Files.list for each directory we'll process
            mockedFiles
                    .when(() -> Files.list(eq(systemTempDir)))
                    .thenReturn(
                            Stream.of(
                                    ourTempFile1,
                                    ourTempFile2,
                                    oldTempFile,
                                    sysTempFile1,
                                    jettyFile1,
                                    jettyFile2,
                                    regularFile,
                                    emptyFile,
                                    nestedDir));

            mockedFiles
                    .when(() -> Files.list(eq(customTempDir)))
                    .thenReturn(Stream.of(ourTempFile3, ourTempFile4, sysTempFile2, sysTempFile3));

            mockedFiles
                    .when(() -> Files.list(eq(libreOfficeTempDir)))
                    .thenReturn(Stream.of(ourTempFile5));

            mockedFiles.when(() -> Files.list(eq(nestedDir))).thenReturn(Stream.of(nestedTempFile));

            // Configure Files.isDirectory for each path
            mockedFiles.when(() -> Files.isDirectory(eq(nestedDir))).thenReturn(true);
            mockedFiles.when(() -> Files.isDirectory(any(Path.class))).thenReturn(false);

            // Configure Files.exists to return true for all paths
            mockedFiles.when(() -> Files.exists(any(Path.class))).thenReturn(true);

            // Configure Files.getLastModifiedTime to return different times based on file names
            mockedFiles
                    .when(() -> Files.getLastModifiedTime(any(Path.class)))
                    .thenAnswer(
                            invocation -> {
                                Path path = invocation.getArgument(0);
                                String fileName = path.getFileName().toString();

                                // For files with "old" in the name, return a timestamp older than
                                // maxAgeMillis
                                if (fileName.contains("old")) {
                                    return FileTime.fromMillis(
                                            System.currentTimeMillis() - 5000000);
                                }
                                // For empty.tmp file, return a timestamp older than 5 minutes (for
                                // empty file test)
                                else if (fileName.equals("empty.tmp")) {
                                    return FileTime.fromMillis(
                                            System.currentTimeMillis() - 6 * 60 * 1000);
                                }
                                // For all other files, return a recent timestamp
                                else {
                                    return FileTime.fromMillis(
                                            System.currentTimeMillis() - 60000); // 1 minute ago
                                }
                            });

            // Configure Files.size to return different sizes based on file names
            mockedFiles
                    .when(() -> Files.size(any(Path.class)))
                    .thenAnswer(
                            invocation -> {
                                Path path = invocation.getArgument(0);
                                String fileName = path.getFileName().toString();

                                // Return 0 bytes for the empty file
                                if (fileName.equals("empty.tmp")) {
                                    return 0L;
                                }
                                // Return normal size for all other files
                                else {
                                    return 1024L; // 1 KB
                                }
                            });

            // For deleteIfExists, track which files would be deleted
            mockedFiles
                    .when(() -> Files.deleteIfExists(any(Path.class)))
                    .thenAnswer(
                            invocation -> {
                                Path path = invocation.getArgument(0);
                                deletedFiles.add(path);
                                return true;
                            });

            // Act - set containerMode to false for this test
            invokeCleanupDirectoryStreaming(systemTempDir, false, 0, 3600000);
            invokeCleanupDirectoryStreaming(customTempDir, false, 0, 3600000);
            invokeCleanupDirectoryStreaming(libreOfficeTempDir, false, 0, 3600000);

            // Assert - Only old temp files and empty files should be deleted
            assertTrue(deletedFiles.contains(oldTempFile), "Old temp file should be deleted");
            assertTrue(deletedFiles.contains(emptyFile), "Empty file should be deleted");

            // Regular temp files should not be deleted because they're too new
            assertFalse(
                    deletedFiles.contains(ourTempFile1), "Recent temp file should be preserved");
            assertFalse(
                    deletedFiles.contains(ourTempFile2), "Recent temp file should be preserved");
            assertFalse(
                    deletedFiles.contains(ourTempFile3), "Recent temp file should be preserved");
            assertFalse(
                    deletedFiles.contains(ourTempFile4), "Recent temp file should be preserved");
            assertFalse(
                    deletedFiles.contains(ourTempFile5), "Recent temp file should be preserved");

            // System temp files should not be deleted in non-container mode
            assertFalse(
                    deletedFiles.contains(sysTempFile1),
                    "System temp file should be preserved in non-container mode");
            assertFalse(
                    deletedFiles.contains(sysTempFile2),
                    "System temp file should be preserved in non-container mode");
            assertFalse(
                    deletedFiles.contains(sysTempFile3),
                    "System temp file should be preserved in non-container mode");

            // Jetty files and regular files should never be deleted
            assertFalse(deletedFiles.contains(jettyFile1), "Jetty file should be preserved");
            assertFalse(
                    deletedFiles.contains(jettyFile2),
                    "File with jetty in name should be preserved");
            assertFalse(deletedFiles.contains(regularFile), "Regular file should be preserved");
        }
    }

    @Test
    public void testContainerModeCleanup() throws IOException {
        // Arrange - Create various temp files
        Path ourTempFile = Files.createFile(systemTempDir.resolve("output_123.pdf"));
        Path sysTempFile = Files.createFile(systemTempDir.resolve("lu123abc.tmp"));
        Path regularFile = Files.createFile(systemTempDir.resolve("important.txt"));

        // Configure mock registry to say these files aren't registered
        when(registry.contains(any(File.class))).thenReturn(false);

        // The set of files that will be deleted in our test
        Set<Path> deletedFiles = new HashSet<>();

        // Use MockedStatic to mock Files operations
        try (MockedStatic<Files> mockedFiles = mockStatic(Files.class)) {
            // Mock Files.list for systemTempDir
            mockedFiles
                    .when(() -> Files.list(eq(systemTempDir)))
                    .thenReturn(Stream.of(ourTempFile, sysTempFile, regularFile));

            // Configure Files.isDirectory
            mockedFiles.when(() -> Files.isDirectory(any(Path.class))).thenReturn(false);

            // Configure Files.exists
            mockedFiles.when(() -> Files.exists(any(Path.class))).thenReturn(true);

            // Configure Files.getLastModifiedTime to return recent timestamps
            mockedFiles
                    .when(() -> Files.getLastModifiedTime(any(Path.class)))
                    .thenReturn(
                            FileTime.fromMillis(
                                    System.currentTimeMillis() - 60000)); // 1 minute ago

            // Configure Files.size to return normal size
            mockedFiles.when(() -> Files.size(any(Path.class))).thenReturn(1024L); // 1 KB

            // For deleteIfExists, track which files would be deleted
            mockedFiles
                    .when(() -> Files.deleteIfExists(any(Path.class)))
                    .thenAnswer(
                            invocation -> {
                                Path path = invocation.getArgument(0);
                                deletedFiles.add(path);
                                return true;
                            });

            // Act - set containerMode to true and maxAgeMillis to 0 for container startup cleanup
            invokeCleanupDirectoryStreaming(systemTempDir, true, 0, 0);

            // Assert - In container mode, both our temp files and system temp files should be
            // deleted
            // regardless of age (when maxAgeMillis is 0)
            assertTrue(
                    deletedFiles.contains(ourTempFile),
                    "Our temp file should be deleted in container mode");
            assertTrue(
                    deletedFiles.contains(sysTempFile),
                    "System temp file should be deleted in container mode");
            assertFalse(deletedFiles.contains(regularFile), "Regular file should be preserved");
        }
    }

    @Test
    public void testEmptyFileHandling() throws IOException {
        // Arrange - Create an empty file
        Path emptyFile = Files.createFile(systemTempDir.resolve("empty.tmp"));
        Path recentEmptyFile = Files.createFile(systemTempDir.resolve("recent_empty.tmp"));

        // Configure mock registry to say these files aren't registered
        when(registry.contains(any(File.class))).thenReturn(false);

        // The set of files that will be deleted in our test
        Set<Path> deletedFiles = new HashSet<>();

        // Use MockedStatic to mock Files operations
        try (MockedStatic<Files> mockedFiles = mockStatic(Files.class)) {
            // Mock Files.list for systemTempDir
            mockedFiles
                    .when(() -> Files.list(eq(systemTempDir)))
                    .thenReturn(Stream.of(emptyFile, recentEmptyFile));

            // Configure Files.isDirectory
            mockedFiles.when(() -> Files.isDirectory(any(Path.class))).thenReturn(false);

            // Configure Files.exists
            mockedFiles.when(() -> Files.exists(any(Path.class))).thenReturn(true);

            // Configure Files.getLastModifiedTime to return different times based on file names
            mockedFiles
                    .when(() -> Files.getLastModifiedTime(any(Path.class)))
                    .thenAnswer(
                            invocation -> {
                                Path path = invocation.getArgument(0);
                                String fileName = path.getFileName().toString();

                                if (fileName.equals("empty.tmp")) {
                                    // More than 5 minutes old
                                    return FileTime.fromMillis(
                                            System.currentTimeMillis() - 6 * 60 * 1000);
                                } else {
                                    // Less than 5 minutes old
                                    return FileTime.fromMillis(
                                            System.currentTimeMillis() - 2 * 60 * 1000);
                                }
                            });

            // Configure Files.size to return 0 for empty files
            mockedFiles.when(() -> Files.size(any(Path.class))).thenReturn(0L);

            // For deleteIfExists, track which files would be deleted
            mockedFiles
                    .when(() -> Files.deleteIfExists(any(Path.class)))
                    .thenAnswer(
                            invocation -> {
                                Path path = invocation.getArgument(0);
                                deletedFiles.add(path);
                                return true;
                            });

            // Act
            invokeCleanupDirectoryStreaming(systemTempDir, false, 0, 3600000);

            // Assert
            assertTrue(
                    deletedFiles.contains(emptyFile),
                    "Empty file older than 5 minutes should be deleted");
            assertFalse(
                    deletedFiles.contains(recentEmptyFile),
                    "Empty file newer than 5 minutes should not be deleted");
        }
    }

    @Test
    public void testRecursiveDirectoryCleaning() throws IOException {
        // Arrange - Create a nested directory structure with temp files
        Path dir1 = Files.createDirectories(systemTempDir.resolve("dir1"));
        Path dir2 = Files.createDirectories(dir1.resolve("dir2"));
        Path dir3 = Files.createDirectories(dir2.resolve("dir3"));

        Path tempFile1 = Files.createFile(dir1.resolve("output_1.pdf"));
        Path tempFile2 = Files.createFile(dir2.resolve("output_2.pdf"));
        Path tempFile3 = Files.createFile(dir3.resolve("output_old_3.pdf"));

        // Configure mock registry to say these files aren't registered
        when(registry.contains(any(File.class))).thenReturn(false);

        // The set of files that will be deleted in our test
        Set<Path> deletedFiles = new HashSet<>();

        // Use MockedStatic to mock Files operations
        try (MockedStatic<Files> mockedFiles = mockStatic(Files.class)) {
            // Mock Files.list for each directory
            mockedFiles.when(() -> Files.list(eq(systemTempDir))).thenReturn(Stream.of(dir1));

            mockedFiles.when(() -> Files.list(eq(dir1))).thenReturn(Stream.of(tempFile1, dir2));

            mockedFiles.when(() -> Files.list(eq(dir2))).thenReturn(Stream.of(tempFile2, dir3));

            mockedFiles.when(() -> Files.list(eq(dir3))).thenReturn(Stream.of(tempFile3));

            // Configure Files.isDirectory for each path
            mockedFiles.when(() -> Files.isDirectory(eq(dir1))).thenReturn(true);
            mockedFiles.when(() -> Files.isDirectory(eq(dir2))).thenReturn(true);
            mockedFiles.when(() -> Files.isDirectory(eq(dir3))).thenReturn(true);
            mockedFiles.when(() -> Files.isDirectory(eq(tempFile1))).thenReturn(false);
            mockedFiles.when(() -> Files.isDirectory(eq(tempFile2))).thenReturn(false);
            mockedFiles.when(() -> Files.isDirectory(eq(tempFile3))).thenReturn(false);

            // Configure Files.exists to return true for all paths
            mockedFiles.when(() -> Files.exists(any(Path.class))).thenReturn(true);

            // Configure Files.getLastModifiedTime to return different times based on file names
            mockedFiles
                    .when(() -> Files.getLastModifiedTime(any(Path.class)))
                    .thenAnswer(
                            invocation -> {
                                Path path = invocation.getArgument(0);
                                String fileName = path.getFileName().toString();

                                if (fileName.contains("old")) {
                                    // Old file
                                    return FileTime.fromMillis(
                                            System.currentTimeMillis() - 5000000);
                                } else {
                                    // Recent file
                                    return FileTime.fromMillis(System.currentTimeMillis() - 60000);
                                }
                            });

            // Configure Files.size to return normal size
            mockedFiles.when(() -> Files.size(any(Path.class))).thenReturn(1024L);

            // For deleteIfExists, track which files would be deleted
            mockedFiles
                    .when(() -> Files.deleteIfExists(any(Path.class)))
                    .thenAnswer(
                            invocation -> {
                                Path path = invocation.getArgument(0);
                                deletedFiles.add(path);
                                return true;
                            });

            // Act
            invokeCleanupDirectoryStreaming(systemTempDir, false, 0, 3600000);

            // Debug - print what was deleted
            System.out.println("Deleted files: " + deletedFiles);
            System.out.println("Looking for: " + tempFile3);

            // Assert
            assertFalse(deletedFiles.contains(tempFile1), "Recent temp file should be preserved");
            assertFalse(deletedFiles.contains(tempFile2), "Recent temp file should be preserved");
            assertTrue(
                    deletedFiles.contains(tempFile3),
                    "Old temp file in nested directory should be deleted");
        }
    }

    /** Helper method to invoke the private cleanupDirectoryStreaming method using reflection */
    private void invokeCleanupDirectoryStreaming(
            Path directory, boolean containerMode, int depth, long maxAgeMillis)
            throws IOException {
        try {
            // Create a consumer that tracks deleted files
            AtomicInteger deleteCount = new AtomicInteger(0);
            Consumer<Path> deleteCallback = path -> deleteCount.incrementAndGet();

            // Get the method with updated signature
            var method =
                    TempFileCleanupService.class.getDeclaredMethod(
                            "cleanupDirectoryStreaming",
                            Path.class,
                            boolean.class,
                            int.class,
                            long.class,
                            boolean.class,
                            Consumer.class);
            method.setAccessible(true);

            // Invoke the method with appropriate parameters
            method.invoke(
                    cleanupService,
                    directory,
                    containerMode,
                    depth,
                    maxAgeMillis,
                    false,
                    deleteCallback);
        } catch (Exception e) {
            throw new RuntimeException("Error invoking cleanupDirectoryStreaming", e);
        }
    }

    // Matcher for exact path equality
    private static Path eq(Path path) {
        return argThat(arg -> arg != null && arg.equals(path));
    }
}
