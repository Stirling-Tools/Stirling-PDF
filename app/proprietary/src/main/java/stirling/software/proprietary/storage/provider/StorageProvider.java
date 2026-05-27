package stirling.software.proprietary.storage.provider;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.util.Optional;

import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.proprietary.security.model.User;

public interface StorageProvider extends AutoCloseable {
    StoredObject store(User owner, MultipartFile file) throws IOException;

    Resource load(String storageKey) throws IOException;

    void delete(String storageKey) throws IOException;

    /**
     * Releases any backend-specific resources. Default no-op so {@link LocalStorageProvider} and
     * {@link DatabaseStorageProvider} (which hold no closeable handles) satisfy Spring's
     * {@code @Bean(destroyMethod = "close")} signature requirement without ceremony. {@code
     * S3StorageProvider} overrides this to close the underlying SDK client + presigner.
     */
    @Override
    default void close() {}

    /**
     * Returns a presigned download URL valid for {@code ttl}, or {@link Optional#empty()} if the
     * provider does not support signed URLs (callers fall back to {@link #load(String)}).
     */
    default Optional<URI> signedDownloadUrl(String storageKey, Duration ttl) throws IOException {
        return signedDownloadUrl(storageKey, ttl, false, null);
    }

    /**
     * Like {@link #signedDownloadUrl(String, Duration)} with explicit Content-Disposition control.
     */
    default Optional<URI> signedDownloadUrl(
            String storageKey, Duration ttl, boolean inline, String originalFilename)
            throws IOException {
        return Optional.empty();
    }
}
