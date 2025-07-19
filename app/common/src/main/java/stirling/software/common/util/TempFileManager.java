package stirling.software.common.util;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

/**
 * Service for managing temporary files in Stirling-PDF. Provides methods for creating, tracking,
 * and cleaning up temporary files.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TempFileManager {

    private final TempFileRegistry registry;
    private final ApplicationProperties applicationProperties;

    /**
     * Create a temporary file with the Stirling-PDF prefix. The file is automatically registered
     * with the registry.
     *
     * @param suffix The suffix for the temporary file
     * @return The created temporary file
     * @throws IOException If an I/O error occurs
     */
    public File createTempFile(String suffix) throws IOException {
        ApplicationProperties.TempFileManagement tempFiles =
                applicationProperties.getSystem().getTempFileManagement();
        Path tempFilePath;
        String customTempDirectory = tempFiles.getBaseTmpDir();
        if (customTempDirectory != null && !customTempDirectory.isEmpty()) {
            Path tempDir = Path.of(customTempDirectory);
            if (!Files.exists(tempDir)) {
                Files.createDirectories(tempDir);
            }
            tempFilePath = Files.createTempFile(tempDir, tempFiles.getPrefix(), suffix);
        } else {
            tempFilePath = Files.createTempFile(tempFiles.getPrefix(), suffix);
        }
        File tempFile = tempFilePath.toFile();
        return registry.register(tempFile);
    }

    /**
     * Create a temporary directory with the Stirling-PDF prefix. The directory is automatically
     * registered with the registry.
     *
     * @return The created temporary directory
     * @throws IOException If an I/O error occurs
     */
    public Path createTempDirectory() throws IOException {
        ApplicationProperties.TempFileManagement tempFiles =
                applicationProperties.getSystem().getTempFileManagement();
        Path tempDirPath;
        String customTempDirectory = tempFiles.getBaseTmpDir();
        if (customTempDirectory != null && !customTempDirectory.isEmpty()) {
            Path tempDir = Path.of(customTempDirectory);
            if (!Files.exists(tempDir)) {
                Files.createDirectories(tempDir);
            }
            tempDirPath = Files.createTempDirectory(tempDir, tempFiles.getPrefix());
        } else {
            tempDirPath = Files.createTempDirectory(tempFiles.getPrefix());
        }
        return registry.registerDirectory(tempDirPath);
    }

    /**
     * Convert a MultipartFile to a temporary File and register it. This is a wrapper around
     * GeneralUtils.convertMultipartFileToFile that ensures the created temp file is registered.
     *
     * @param multipartFile The MultipartFile to convert
     * @return The created temporary file
     * @throws IOException If an I/O error occurs
     */
    public File convertMultipartFileToFile(MultipartFile multipartFile) throws IOException {
        File tempFile = GeneralUtils.convertMultipartFileToFile(multipartFile);
        return registry.register(tempFile);
    }

    /**
     * Delete a temporary file and unregister it from the registry.
     *
     * @param file The file to delete
     * @return true if the file was deleted successfully, false otherwise
     */
    public boolean deleteTempFile(File file) {
        if (file != null && file.exists()) {
            boolean deleted = file.delete();
            if (deleted) {
                registry.unregister(file);
                log.debug("Deleted temp file: {}", file.getAbsolutePath());
            } else {
                log.warn("Failed to delete temp file: {}", file.getAbsolutePath());
            }
            return deleted;
        }
        return false;
    }

    /**
     * Delete a temporary file and unregister it from the registry.
     *
     * @param path The path to delete
     * @return true if the file was deleted successfully, false otherwise
     */
    public boolean deleteTempFile(Path path) {
        if (path != null) {
            try {
                boolean deleted = Files.deleteIfExists(path);
                if (deleted) {
                    registry.unregister(path);
                    log.debug("Deleted temp file: {}", path.toString());
                } else {
                    log.debug("Temp file already deleted or does not exist: {}", path.toString());
                }
                return deleted;
            } catch (IOException e) {
                log.warn("Failed to delete temp file: {}", path.toString(), e);
                return false;
            }
        }
        return false;
    }

    /**
     * Delete a temporary directory and all its contents.
     *
     * @param directory The directory to delete
     */
    public void deleteTempDirectory(Path directory) {
        if (directory != null && Files.isDirectory(directory)) {
            try {
                GeneralUtils.deleteDirectory(directory);
                log.debug("Deleted temp directory: {}", directory.toString());
            } catch (IOException e) {
                log.warn("Failed to delete temp directory: {}", directory.toString(), e);
            }
        }
    }

    /**
     * Register an existing file with the registry.
     *
     * @param file The file to register
     * @return The same file for method chaining
     */
    public File register(File file) {
        if (file != null && file.exists()) {
            return registry.register(file);
        }
        return file;
    }

    /**
     * Clean up old temporary files based on age.
     *
     * @param maxAgeMillis Maximum age in milliseconds for temp files
     * @return Number of files deleted
     */
    public int cleanupOldTempFiles(long maxAgeMillis) {
        int deletedCount = 0;

        // Get files older than max age
        Set<Path> oldFiles = registry.getFilesOlderThan(maxAgeMillis);

        // Delete each old file
        for (Path file : oldFiles) {
            if (deleteTempFile(file)) {
                deletedCount++;
            }
        }

        log.info("Cleaned up {} old temporary files", deletedCount);
        return deletedCount;
    }

    /**
     * Get the maximum age for temporary files in milliseconds.
     *
     * @return Maximum age in milliseconds
     */
    public long getMaxAgeMillis() {
        long maxAgeHours =
                applicationProperties.getSystem().getTempFileManagement().getMaxAgeHours();
        return Duration.ofHours(maxAgeHours).toMillis();
    }

    /**
     * Generate a unique temporary file name with the Stirling-PDF prefix.
     *
     * @param type Type identifier for the temp file
     * @param extension File extension (without the dot)
     * @return A unique temporary file name
     */
    public String generateTempFileName(String type, String extension) {
        String tempFilePrefix =
                applicationProperties.getSystem().getTempFileManagement().getPrefix();
        String uuid = UUID.randomUUID().toString().substring(0, 8);
        return tempFilePrefix + type + "-" + uuid + "." + extension;
    }

    /**
     * Register a known LibreOffice temporary directory. This is used when integrating with
     * LibreOffice for file conversions.
     *
     * @return The LibreOffice temp directory
     * @throws IOException If directory creation fails
     */
    public Path registerLibreOfficeTempDir() throws IOException {
        ApplicationProperties.TempFileManagement tempFiles =
                applicationProperties.getSystem().getTempFileManagement();
        Path loTempDir;
        String libreOfficeTempDir = tempFiles.getLibreofficeDir();
        String customTempDirectory = tempFiles.getBaseTmpDir();

        // First check if explicitly configured
        if (libreOfficeTempDir != null && !libreOfficeTempDir.isEmpty()) {
            loTempDir = Path.of(libreOfficeTempDir);
        }
        // Next check if we have a custom temp directory
        else if (customTempDirectory != null && !customTempDirectory.isEmpty()) {
            loTempDir = Path.of(customTempDirectory, "libreoffice");
        }
        // Fall back to system temp dir with our application prefix
        else {
            loTempDir = Path.of(System.getProperty("java.io.tmpdir"), "stirling-pdf-libreoffice");
        }

        if (!Files.exists(loTempDir)) {
            Files.createDirectories(loTempDir);
        }

        return registry.registerDirectory(loTempDir);
    }
}
