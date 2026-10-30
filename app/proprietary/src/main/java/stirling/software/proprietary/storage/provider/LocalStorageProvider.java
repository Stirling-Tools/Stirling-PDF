package stirling.software.proprietary.storage.provider;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.security.model.User;

@RequiredArgsConstructor
public class LocalStorageProvider implements StorageProvider {

    private static final Pattern CONTROL_CHARACTER_PATTERN = Pattern.compile("\\p{Cntrl}");
    private final Path basePath;

    @Override
    public StoredObject store(User owner, MultipartFile file) throws IOException {
        if (owner == null || owner.getId() == null) {
            throw new IllegalArgumentException("owner.id is required for local storage key");
        }
        String originalFilename = sanitizeFilename(file.getOriginalFilename());
        String storageKey =
                owner.getId()
                        + "/"
                        + UUID.randomUUID()
                        + "_"
                        + Optional.ofNullable(originalFilename).orElse("file");
        Path targetPath = basePath.resolve(storageKey).normalize();

        if (!targetPath.startsWith(basePath)) {
            throw new IOException("Resolved storage path is outside the storage directory");
        }

        Files.createDirectories(targetPath.getParent());
        boolean copiedFromPath = false;
        try {
            // A disk-backed multipart (stored file, chunk assembly) can be copied path-to-path,
            // letting the JDK use sendfile/copy_file_range instead of an 8 KiB stream loop.
            Resource resource = file.getResource();
            if (resource != null && resource.isFile()) {
                Files.copy(
                        resource.getFile().toPath(),
                        targetPath,
                        StandardCopyOption.REPLACE_EXISTING);
                copiedFromPath = true;
            }
        } catch (IOException | RuntimeException ignored) {
            // Fall back to the stream copy below.
        }
        if (!copiedFromPath) {
            try (InputStream inputStream = file.getInputStream()) {
                Files.copy(inputStream, targetPath, StandardCopyOption.REPLACE_EXISTING);
            }
        }

        return StoredObject.builder()
                .storageKey(storageKey)
                .originalFilename(originalFilename)
                .contentType(file.getContentType())
                .sizeBytes(file.getSize())
                .build();
    }

    @Override
    public StoredObject storeFromPath(
            User owner, Path source, String originalFilename, String contentType)
            throws IOException {
        if (owner == null || owner.getId() == null) {
            throw new IllegalArgumentException("owner.id is required for local storage key");
        }
        String sanitizedFilename = sanitizeFilename(originalFilename);
        String storageKey =
                owner.getId()
                        + "/"
                        + UUID.randomUUID()
                        + "_"
                        + Optional.ofNullable(sanitizedFilename).orElse("file");
        Path targetPath = basePath.resolve(storageKey).normalize();
        if (!targetPath.startsWith(basePath)) {
            throw new IOException("Resolved storage path is outside the storage directory");
        }
        Path normalizedSource = source.toAbsolutePath().normalize();
        Path tempRoot =
                Paths.get(System.getProperty("java.io.tmpdir")).toAbsolutePath().normalize();
        if (!normalizedSource.startsWith(tempRoot)
                || !Files.isRegularFile(normalizedSource, LinkOption.NOFOLLOW_LINKS)) {
            throw new IOException("Source path is not a regular file under the temp directory");
        }
        Files.createDirectories(targetPath.getParent());
        try {
            Files.move(normalizedSource, targetPath, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException moveFailed) {
            Files.copy(normalizedSource, targetPath, StandardCopyOption.REPLACE_EXISTING);
            Files.deleteIfExists(normalizedSource);
        }
        return StoredObject.builder()
                .storageKey(storageKey)
                .originalFilename(sanitizedFilename)
                .contentType(contentType)
                .sizeBytes(Files.size(targetPath))
                .build();
    }

    @Override
    public Resource load(String storageKey) throws IOException {
        Path targetPath = basePath.resolve(storageKey).normalize();
        if (!targetPath.startsWith(basePath)) {
            throw new IOException("Resolved storage path is outside the storage directory");
        }

        if (!Files.exists(targetPath)) {
            throw new IOException("File not found");
        }

        return new FileSystemResource(targetPath.toFile());
    }

    @Override
    public void delete(String storageKey) throws IOException {
        Path targetPath = basePath.resolve(storageKey).normalize();
        if (!targetPath.startsWith(basePath)) {
            throw new IOException("Resolved storage path is outside the storage directory");
        }
        Files.deleteIfExists(targetPath);
    }

    private String sanitizeFilename(String filename) {
        if (filename == null || filename.isBlank()) {
            return "file";
        }
        String stripped =
                CONTROL_CHARACTER_PATTERN
                        .matcher(Paths.get(filename).getFileName().toString())
                        .replaceAll("");
        return stripped.isBlank() ? "file" : stripped;
    }
}
