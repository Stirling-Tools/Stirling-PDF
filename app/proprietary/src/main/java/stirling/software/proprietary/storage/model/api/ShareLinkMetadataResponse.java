package stirling.software.proprietary.storage.model.api;

import java.time.LocalDateTime;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class ShareLinkMetadataResponse {
    private final String shareToken;
    private final Long fileId;
    private final String fileName;
    private final String owner;
    private final boolean ownedByCurrentUser;
    private final boolean publicLink;
    private final LocalDateTime createdAt;
    private final LocalDateTime lastAccessedAt;
}
