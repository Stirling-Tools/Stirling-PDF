package stirling.software.proprietary.storage.crypto;

import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

/**
 * Shared HTTP translation for encryption failures, so every path that serves stored bytes answers a
 * revoked key the same way. {@link StorageKeyRevokedException} extends {@code IOException}, so a
 * caller that only catches {@code IOException} reports a deliberate, reversible policy state as a
 * server fault.
 */
public final class StorageEncryptionErrors {

    private StorageEncryptionErrors() {}

    public static WebApplicationException revoked(StorageKeyRevokedException cause) {
        return new WebApplicationException(
                "Access to this file has been revoked (its encryption key is disabled)",
                cause,
                Response.Status.FORBIDDEN);
    }
}
