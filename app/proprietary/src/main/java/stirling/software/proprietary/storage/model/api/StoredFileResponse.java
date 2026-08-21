package stirling.software.proprietary.storage.model.api;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import lombok.Builder;
import lombok.Getter;

@Getter
@Builder
public class StoredFileResponse {
    private final Long id;
    private final String fileName;
    private final String contentType;
    private final long sizeBytes;
    private final String owner;
    private final boolean ownedByCurrentUser;
    private final String accessRole;
    private final LocalDateTime createdAt;
    private final LocalDateTime updatedAt;
    private final List<String> sharedWithUsers;
    private final List<SharedUserResponse> sharedUsers;
    private final List<ShareLinkResponse> shareLinks;
    private final String filePurpose;

    /**
     * Optional folder placement (Phase A). Null when the file lives at the root or when the server
     * build doesn't have the folders feature enabled - existing clients should treat null as root.
     */
    private final UUID folderId;
}
