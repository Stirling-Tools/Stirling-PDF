package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.AdditionalAnswers.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.multipart.MultipartFile;

class FileStorageTest {

    @TempDir Path tempDir;

    @Mock private FileOrUploadService fileOrUploadService;

    @InjectMocks private FileStorage fileStorage;

    private MultipartFile mockFile;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        ReflectionTestUtils.setField(fileStorage, "tempDirPath", tempDir.toString());

        // Create a mock MultipartFile
        mockFile = mock(MultipartFile.class);
        when(mockFile.getOriginalFilename()).thenReturn("test.pdf");
        when(mockFile.getContentType()).thenReturn("application/pdf");
    }

    @Test
    void testStoreFile() throws IOException {
        // Arrange
        byte[] fileContent = "Test PDF content".getBytes();
        when(mockFile.getBytes()).thenReturn(fileContent);

        // Set up mock to handle transferTo by writing the file
        doAnswer(
                        invocation -> {
                            java.io.File file = invocation.getArgument(0);
                            Files.write(file.toPath(), fileContent);
                            return null;
                        })
                .when(mockFile)
                .transferTo(any(java.io.File.class));

        // Act
        String fileId = fileStorage.storeFile(mockFile);

        // Assert
        assertNotNull(fileId);
        assertTrue(Files.exists(tempDir.resolve(fileId)));
        verify(mockFile).transferTo(any(java.io.File.class));
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
        String nonExistentFileId = "non-existent-file";

        // Act & Assert
        assertThrows(IOException.class, () -> fileStorage.retrieveFile(nonExistentFileId));
    }

    @Test
    void testRetrieveBytes_FileNotFound() {
        // Arrange
        String nonExistentFileId = "non-existent-file";

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
        String nonExistentFileId = "non-existent-file";

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
        String nonExistentFileId = "non-existent-file";

        // Act
        boolean result = fileStorage.fileExists(nonExistentFileId);

        // Assert
        assertFalse(result);
    }
}
