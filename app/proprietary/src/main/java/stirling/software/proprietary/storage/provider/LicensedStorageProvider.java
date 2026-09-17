package stirling.software.proprietary.storage.provider;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.util.Optional;
import java.util.function.BooleanSupplier;

import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.proprietary.security.model.User;

/** Stops new paid storage writes while keeping existing content readable after entitlement loss. */
public record LicensedStorageProvider(StorageProvider delegate, BooleanSupplier licensed)
        implements StorageProvider {
    @Override
    public StoredObject store(User owner, MultipartFile file) throws IOException {
        if (!licensed.getAsBoolean())
            throw new IOException(
                    "Paid storage is paused. Restore the Stirling account connection or a valid licence.");
        return delegate.store(owner, file);
    }

    @Override
    public Resource load(String key) throws IOException {
        return delegate.load(key);
    }

    @Override
    public void delete(String key) throws IOException {
        delegate.delete(key);
    }

    @Override
    public Optional<URI> signedDownloadUrl(String key, Duration ttl, boolean inline, String name)
            throws IOException {
        return delegate.signedDownloadUrl(key, ttl, inline, name);
    }

    @Override
    public void close() {
        delegate.close();
    }
}
