package stirling.software.proprietary.storage.crypto;

import java.io.IOException;

/** Storage encrypt/decrypt failure (missing/disabled key, master-key mismatch, tampered blob). */
public class StorageEncryptionException extends IOException {

    public StorageEncryptionException(String message) {
        super(message);
    }

    public StorageEncryptionException(String message, Throwable cause) {
        super(message, cause);
    }
}
