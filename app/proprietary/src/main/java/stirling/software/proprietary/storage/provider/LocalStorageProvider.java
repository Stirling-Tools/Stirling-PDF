package stirling.software.proprietary.storage.provider;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.User;

@Slf4j
@RequiredArgsConstructor
public class LocalStorageProvider implements StorageProvider {

    private static final Pattern CONTROL_CHARACTER_PATTERN = Pattern.compile("\\p{Cntrl}");
    private final Path basePath;
    private final AtomicBoolean missingWarned = new AtomicBoolean();

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
            warnMissingOnce(storageKey);
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

    // The database knows the file but this disk does not: usually several nodes on local storage.
    private void warnMissingOnce(String storageKey) {
        if (missingWarned.compareAndSet(false, true)) {
            log.warn(
                    "Stored file '{}' is in the database but not under {}. If several Stirling"
                            + " nodes share this database, enable cluster mode with shared storage"
                            + " (storage.provider=s3 or database), or each node only sees its own"
                            + " files.",
                    storageKey,
                    basePath);
        }
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
