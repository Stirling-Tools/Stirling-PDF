package stirling.software.proprietary.storage.provider;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class StoredObject {
    private final String storageKey;
    private final String originalFilename;
    private final String contentType;
    private final long sizeBytes;
}
