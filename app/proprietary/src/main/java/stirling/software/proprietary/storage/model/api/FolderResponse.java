package stirling.software.proprietary.storage.model.api;

import java.time.LocalDateTime;
import java.util.UUID;

import stirling.software.proprietary.storage.model.Folder;

/**
 * Outbound DTO for folder responses. Records are immutable, value-equality-based, and far less
 * accident-prone than a {@code @Data} class with public setters.
 */
public record FolderResponse(
        UUID id,
        String name,
        UUID parentFolderId,
        String color,
        String icon,
        Long version,
        LocalDateTime createdAt,
        LocalDateTime updatedAt) {

    public static FolderResponse from(Folder folder) {
        // {@code folder.getParent().getId()} on a lazy proxy returns the FK value cached at the
        // join column WITHOUT initialising the proxy under standard Hibernate, so this does
        // not N+1. If a future Hibernate update changes that, switch the JPQL list query to a
        // constructor projection.
        UUID parentId = folder.getParent() == null ? null : folder.getParent().getId();
        return new FolderResponse(
                folder.getId(),
                folder.getName(),
                parentId,
                folder.getColor(),
                folder.getIcon(),
                folder.getVersion(),
                folder.getCreatedAt(),
                folder.getUpdatedAt());
    }
}
