package stirling.software.proprietary.storage.provider;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Optional;
import java.util.UUID;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.security.model.User;

@RequiredArgsConstructor
public class LocalStorageProvider implements StorageProvider {

    private final Path basePath;

    @Override
    public StoredObject store(User owner, MultipartFile file) throws IOException {
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
        try (InputStream inputStream = file.getInputStream()) {
            Files.copy(inputStream, targetPath, StandardCopyOption.REPLACE_EXISTING);
        }

        return StoredObject.builder()
                .storageKey(storageKey)
                .originalFilename(originalFilename)
                .contentType(file.getContentType())
                .sizeBytes(file.getSize())
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
        return Paths.get(filename).getFileName().toString();
    }
}
