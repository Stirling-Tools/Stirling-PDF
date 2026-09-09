package stirling.software.proprietary.storage.provider;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder(toBuilder = true)
public class StoredObject {
    private final String storageKey;
    private final String originalFilename;
    private final String contentType;

    /** Plaintext size. When encryption at rest is active the stored blob is larger. */
    private final long sizeBytes;

    /** file_encryption_keys id that wraps this blob's data key; null when stored plaintext. */
    private final String encryptionKeyId;
}
