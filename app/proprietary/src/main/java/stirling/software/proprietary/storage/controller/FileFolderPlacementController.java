package stirling.software.proprietary.storage.controller;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.storage.service.FolderService;

/**
 * Folder placement endpoints for existing stored files. Thin adapter: validates the request shape,
 * delegates the transaction to {@link FolderService}, then maps the result onto the HTTP status.
 * Authentication, storage-gate, ownership checks, and the bulk cap all live on the service (where
 * {@code @Transactional} also lives) so the JDBC connection isn't held through JSON serialization.
 */
@RestController
@RequestMapping("/api/v1/storage/files")
@RequiredArgsConstructor
public class FileFolderPlacementController {

    private static final int BULK_MOVE_MAX_FILES = 1000;

    private final FolderService folderService;

    /** Move a single file to a folder (or to root when folderId is null). */
    @PatchMapping("/{fileId}/folder")
    public ResponseEntity<Void> moveFileToFolder(
            @PathVariable Long fileId, @Valid @RequestBody FolderPlacement body) {
        folderService.moveFileToFolder(fileId, body.getFolderId());
        return ResponseEntity.noContent().build();
    }

    /**
     * Bulk move - fewer round-trips than calling the single endpoint N times. Returns 200 on full
     * success, 207 (Multi-Status) when some files were skipped (typically because they don't belong
     * to the caller).
     */
    @PatchMapping("/folder")
    public ResponseEntity<BulkMoveResponse> bulkMove(@Valid @RequestBody BulkMoveRequest body) {
        FolderService.BulkMoveResult result =
                folderService.bulkMoveFilesToFolder(body.getFolderId(), body.getFileIds());
        HttpStatus status =
                result.skippedFileIds().isEmpty() ? HttpStatus.OK : HttpStatus.MULTI_STATUS;
        return ResponseEntity.status(status)
                .body(new BulkMoveResponse(result.movedFileIds(), result.skippedFileIds()));
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FolderPlacement {
        private UUID folderId;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BulkMoveRequest {
        private UUID folderId;

        @NotNull
        @Size(
                min = 1,
                max = BULK_MOVE_MAX_FILES,
                message = "fileIds must contain between 1 and 1000 entries")
        private List<Long> fileIds;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BulkMoveResponse {
        private List<Long> movedFileIds;
        private List<Long> skippedFileIds;
    }
}
