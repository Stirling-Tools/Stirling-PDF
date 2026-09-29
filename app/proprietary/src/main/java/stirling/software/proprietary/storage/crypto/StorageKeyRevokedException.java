package stirling.software.proprietary.storage.crypto;

/**
 * The encryption key protecting the requested content is disabled (the per-scope kill switch).
 * Distinct from a generic {@link StorageEncryptionException} so callers can surface this as an
 * access-denied (403) rather than an internal error (500): it is a deliberate, reversible policy
 * state, not a failure. Re-enabling the key restores access.
 */
public class StorageKeyRevokedException extends StorageEncryptionException {

    public StorageKeyRevokedException(String message) {
        super(message);
    }
}
