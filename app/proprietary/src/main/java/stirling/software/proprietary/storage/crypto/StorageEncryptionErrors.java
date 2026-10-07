package stirling.software.proprietary.storage.crypto;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * Shared HTTP translation for encryption failures, so every path that serves stored bytes answers a
 * revoked key the same way. {@link StorageKeyRevokedException} extends {@code IOException}, so a
 * caller that only catches {@code IOException} reports a deliberate, reversible policy state as a
 * server fault.
 */
public final class StorageEncryptionErrors {

    private StorageEncryptionErrors() {}

    public static ResponseStatusException revoked(StorageKeyRevokedException cause) {
        return new ResponseStatusException(
                HttpStatus.FORBIDDEN,
                "Access to this file has been revoked (its encryption key is disabled)",
                cause);
    }
}
