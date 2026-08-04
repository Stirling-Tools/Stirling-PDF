package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import jakarta.enterprise.inject.Instance;

import stirling.software.common.cluster.inprocess.LocalDiskFileStore;
import stirling.software.common.model.MultipartFile;
import stirling.software.common.model.io.InputStreamResource;
import stirling.software.common.model.io.Resource;

/**
 * MIGRATION (Spring -> Quarkus): {@code FileStorage} now takes a CDI {@code
 * Instance<JobOwnershipService>} (was {@code Optional<JobOwnershipService>}) and the {@code
 * MultipartFile}/{@code Resource} types are the migration shims. Ownership enforcement is skipped
 * here by supplying a non-resolvable {@code Instance}, matching the previous {@code
 * Optional.empty()} behaviour. Method signatures and assertions are otherwise unchanged.
 */
class FileStorageTest {

    private static final String APPLICATION_PDF = "application/pdf";

    @TempDir Path tempDir;

    @Mock private FileOrUploadService fileOrUploadService;

    private FileStorage fileStorage;

    private MultipartFile mockFile;

    @SuppressWarnings("unchecked")
    private static Instance<JobOwnershipService> noJobOwnershipService() {
        Instance<JobOwnershipService> instance = mock(Instance.class);
        lenient().when(instance.isResolvable()).thenReturn(false);
        return instance;
    }

    @BeforeEach
    void setUp() throws IOException {
        MockitoAnnotations.openMocks(this);
        fileStorage =
                new FileStorage(
                        fileOrUploadService,
                        new LocalDiskFileStore(tempDir.toString()),
                        noJobOwnershipService());

        // Create a mock MultipartFile
        mockFile = mock(MultipartFile.class);
        lenient().when(mockFile.getOriginalFilename()).thenReturn("test.pdf");
        lenient().when(mockFile.getContentType()).thenReturn(APPLICATION_PDF);
    }

    @Test
    void testStoreFile() throws IOException {
        // Arrange
        byte[] fileContent = "Test PDF content".getBytes();
        when(mockFile.getInputStream()).thenReturn(new ByteArrayInputStream(fileContent));
        // Force the stream path (no file-backed Resource fast path) by returning null resource.
        when(mockFile.getResource()).thenReturn(null);

        // Act
        String fileId = fileStorage.storeFile(mockFile);

        // Assert
        assertNotNull(fileId);
        assertTrue(Files.exists(tempDir.resolve(fileId)));
        assertArrayEquals(fileContent, Files.readAllBytes(tempDir.resolve(fileId)));
    }

    @Test
    void testStoreBytes() throws IOException {
        // Arrange
        byte[] fileContent = "Test PDF content".getBytes();
        String originalName = "test.pdf";

        // Act
        String fileId = fileStorage.storeBytes(fileContent, originalName);

        // Assert
        assertNotNull(fileId);
        assertTrue(Files.exists(tempDir.resolve(fileId)));
        assertArrayEquals(fileContent, Files.readAllBytes(tempDir.resolve(fileId)));
    }

    @Test
    void testRetrieveFile() throws IOException {
        // Arrange
        byte[] fileContent = "Test PDF content".getBytes();
        String fileId = UUID.randomUUID().toString();
        Path filePath = tempDir.resolve(fileId);
        Files.write(filePath, fileContent);

        MultipartFile expectedFile = mock(MultipartFile.class);
        when(fileOrUploadService.toMockMultipartFile(eq(fileId), eq(fileContent)))
                .thenReturn(expectedFile);

        // Act
        MultipartFile result = fileStorage.retrieveFile(fileId);

        // Assert
        assertSame(expectedFile, result);
        verify(fileOrUploadService).toMockMultipartFile(eq(fileId), eq(fileContent));
    }

    @Test
    void testRetrieveBytes() throws IOException {
        // Arrange
        byte[] fileContent = "Test PDF content".getBytes();
        String fileId = UUID.randomUUID().toString();
        Path filePath = tempDir.resolve(fileId);
        Files.write(filePath, fileContent);

        // Act
        byte[] result = fileStorage.retrieveBytes(fileId);

        // Assert
        assertArrayEquals(fileContent, result);
    }

    @Test
    void testRetrieveFile_FileNotFound() {
        // Arrange
        String nonExistentFileId = UUID.randomUUID().toString();

        // Act & Assert
        assertThrows(IOException.class, () -> fileStorage.retrieveFile(nonExistentFileId));
    }

    @Test
    void testRetrieveBytes_FileNotFound() {
        // Arrange
        String nonExistentFileId = UUID.randomUUID().toString();

        // Act & Assert
        assertThrows(IOException.class, () -> fileStorage.retrieveBytes(nonExistentFileId));
    }

    @Test
    void testDeleteFile() throws IOException {
        // Arrange
        byte[] fileContent = "Test PDF content".getBytes();
        String fileId = UUID.randomUUID().toString();
        Path filePath = tempDir.resolve(fileId);
        Files.write(filePath, fileContent);

        // Act
        boolean result = fileStorage.deleteFile(fileId);

        // Assert
        assertTrue(result);
        assertFalse(Files.exists(filePath));
    }

    @Test
    void testDeleteFile_FileNotFound() {
        // Arrange
        String nonExistentFileId = UUID.randomUUID().toString();

        // Act
        boolean result = fileStorage.deleteFile(nonExistentFileId);

        // Assert
        assertFalse(result);
    }

    @Test
    void testFileExists() throws IOException {
        // Arrange
        byte[] fileContent = "Test PDF content".getBytes();
        String fileId = UUID.randomUUID().toString();
        Path filePath = tempDir.resolve(fileId);
        Files.write(filePath, fileContent);

        // Act
        boolean result = fileStorage.fileExists(fileId);

        // Assert
        assertTrue(result);
    }

    @Test
    void testFileExists_FileNotFound() {
        // Arrange
        String nonExistentFileId = UUID.randomUUID().toString();

        // Act
        boolean result = fileStorage.fileExists(nonExistentFileId);

        // Assert
        assertFalse(result);
    }

    @Test
    void storeFromResource_happyPath_persistsContent() throws IOException {
        // Arrange
        byte[] payload = "resource-body-bytes".getBytes(StandardCharsets.UTF_8);
        Resource resource =
                new InputStreamResource(new ByteArrayInputStream(payload), "whatever.pdf");

        // Act
        String fileId = fileStorage.storeFromResource(resource, "whatever.pdf");

        // Assert
        assertNotNull(fileId);
        assertTrue(Files.exists(tempDir.resolve(fileId)));
        assertArrayEquals(payload, fileStorage.retrieveBytes(fileId));
    }

    @Test
    void storeFromResource_failureCleansUpPartialFile() throws IOException {
        // Arrange: a Resource whose getInputStream returns a stream that throws after
        // emitting a few bytes. The FileStore.store finally block must remove the partial
        // file on disk when the copy fails mid-stream.
        byte[] head = "partial".getBytes(StandardCharsets.UTF_8);
        Resource flakyResource =
                new Resource() {
                    @Override
                    public InputStream getInputStream() {
                        return new InputStream() {
                            private int position = 0;

                            @Override
                            public int read() throws IOException {
                                if (position < head.length) {
                                    return head[position++] & 0xFF;
                                }
                                throw new IOException("simulated mid-copy read failure");
                            }

                            @Override
                            public int read(byte[] b, int off, int len) throws IOException {
                                if (position >= head.length) {
                                    throw new IOException("simulated mid-copy read failure");
                                }
                                int toCopy = Math.min(len, head.length - position);
                                System.arraycopy(head, position, b, off, toCopy);
                                position += toCopy;
                                return toCopy;
                            }
                        };
                    }

                    @Override
                    public boolean exists() {
                        return true;
                    }

                    @Override
                    public String getFilename() {
                        return "n.pdf";
                    }

                    @Override
                    public long contentLength() {
                        return head.length;
                    }

                    @Override
                    public java.io.File getFile() throws IOException {
                        throw new IOException("not file-backed");
                    }
                };

        // Snapshot dir contents before the call so we can detect any lingering file.
        long filesBefore;
        try (Stream<Path> s = Files.list(tempDir)) {
            filesBefore = s.count();
        }

        // Act + Assert: IOException must propagate out - not be swallowed.
        assertThrows(
                IOException.class, () -> fileStorage.storeFromResource(flakyResource, "n.pdf"));

        // Assert: no partial file lingers under the storage directory - the FileStore.store
        // failure branch's deleteIfExists must have cleaned it up.
        long filesAfter;
        try (Stream<Path> s = Files.list(tempDir)) {
            filesAfter = s.count();
        }
        assertEquals(
                filesBefore,
                filesAfter,
                "partial file must be cleaned up by FileStore.store finally block");
    }
}
