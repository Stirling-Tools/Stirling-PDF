package stirling.software.common.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * Service for storing and retrieving files with unique file IDs. Used by the AutoJobPostMapping
 * system to handle file references.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class FileStorage {

    @Value("${stirling.tempDir:/tmp/stirling-files}")
    private String tempDirPath;

    private final FileOrUploadService fileOrUploadService;

    /**
     * Store a file and return its unique ID
     *
     * @param file The file to store
     * @return The unique ID assigned to the file
     * @throws IOException If there is an error storing the file
     */
    public String storeFile(MultipartFile file) throws IOException {
        String fileId = generateFileId();
        Path filePath = getFilePath(fileId);

        // Ensure the directory exists
        Files.createDirectories(filePath.getParent());

        // Transfer the file to the storage location
        file.transferTo(filePath.toFile());

        log.debug("Stored file with ID: {}", fileId);
        return fileId;
    }

    /**
     * Store a byte array as a file and return its unique ID
     *
     * @param bytes The byte array to store
     * @param originalName The original name of the file (for extension)
     * @return The unique ID assigned to the file
     * @throws IOException If there is an error storing the file
     */
    public String storeBytes(byte[] bytes, String originalName) throws IOException {
        String fileId = generateFileId();
        Path filePath = getFilePath(fileId);

        // Ensure the directory exists
        Files.createDirectories(filePath.getParent());

        // Write the bytes to the file
        Files.write(filePath, bytes);

        log.debug("Stored byte array with ID: {}", fileId);
        return fileId;
    }

    /**
     * Retrieve a file by its ID as a MultipartFile
     *
     * @param fileId The ID of the file to retrieve
     * @return The file as a MultipartFile
     * @throws IOException If the file doesn't exist or can't be read
     */
    public MultipartFile retrieveFile(String fileId) throws IOException {
        Path filePath = getFilePath(fileId);

        if (!Files.exists(filePath)) {
            throw new IOException("File not found with ID: " + fileId);
        }

        byte[] fileData = Files.readAllBytes(filePath);
        return fileOrUploadService.toMockMultipartFile(fileId, fileData);
    }

    /**
     * Retrieve a file by its ID as a byte array
     *
     * @param fileId The ID of the file to retrieve
     * @return The file as a byte array
     * @throws IOException If the file doesn't exist or can't be read
     */
    public byte[] retrieveBytes(String fileId) throws IOException {
        Path filePath = getFilePath(fileId);

        if (!Files.exists(filePath)) {
            throw new IOException("File not found with ID: " + fileId);
        }

        return Files.readAllBytes(filePath);
    }

    /**
     * Delete a file by its ID
     *
     * @param fileId The ID of the file to delete
     * @return true if the file was deleted, false otherwise
     */
    public boolean deleteFile(String fileId) {
        try {
            Path filePath = getFilePath(fileId);
            return Files.deleteIfExists(filePath);
        } catch (IOException e) {
            log.error("Error deleting file with ID: {}", fileId, e);
            return false;
        }
    }

    /**
     * Check if a file exists by its ID
     *
     * @param fileId The ID of the file to check
     * @return true if the file exists, false otherwise
     */
    public boolean fileExists(String fileId) {
        Path filePath = getFilePath(fileId);
        return Files.exists(filePath);
    }

    /**
     * Get the size of a file by its ID without loading the content into memory
     *
     * @param fileId The ID of the file
     * @return The size of the file in bytes
     * @throws IOException If the file doesn't exist or can't be read
     */
    public long getFileSize(String fileId) throws IOException {
        Path filePath = getFilePath(fileId);

        if (!Files.exists(filePath)) {
            throw new IOException("File not found with ID: " + fileId);
        }

        return Files.size(filePath);
    }

    /**
     * Get the path for a file ID
     *
     * @param fileId The ID of the file
     * @return The path to the file
     * @throws IllegalArgumentException if fileId contains path traversal characters or resolves
     *     outside base directory
     */
    private Path getFilePath(String fileId) {
        // Validate fileId to prevent path traversal
        if (fileId.contains("..") || fileId.contains("/") || fileId.contains("\\")) {
            throw new IllegalArgumentException("Invalid file ID");
        }

        Path basePath = Path.of(tempDirPath).normalize().toAbsolutePath();
        Path resolvedPath = basePath.resolve(fileId).normalize();

        // Ensure resolved path is within the base directory
        if (!resolvedPath.startsWith(basePath)) {
            throw new IllegalArgumentException("File ID resolves to an invalid path");
        }

        return resolvedPath;
    }

    /**
     * Generate a unique file ID
     *
     * @return A unique file ID
     */
    private String generateFileId() {
        return UUID.randomUUID().toString();
    }
}
