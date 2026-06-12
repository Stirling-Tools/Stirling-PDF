package stirling.software.proprietary.storage.controller;

import java.util.List;
import java.util.UUID;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.Response;

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
@ApplicationScoped
@Path("/api/v1/storage/files")
@RequiredArgsConstructor
public class FileFolderPlacementController {

    private static final int BULK_MOVE_MAX_FILES = 1000;

    private final FolderService folderService;

    /** Move a single file to a folder (or to root when folderId is null). */
    @PATCH
    @Path("/{fileId}/folder")
    public Response moveFileToFolder(
            @PathParam("fileId") Long fileId, @Valid FolderPlacement body) {
        folderService.moveFileToFolder(fileId, body.getFolderId());
        return Response.noContent().build();
    }

    /**
     * Bulk move - fewer round-trips than calling the single endpoint N times. Returns 200 on full
     * success, 207 (Multi-Status) when some files were skipped (typically because they don't belong
     * to the caller).
     */
    @PATCH
    @Path("/folder")
    public Response bulkMove(@Valid BulkMoveRequest body) {
        FolderService.BulkMoveResult result =
                folderService.bulkMoveFilesToFolder(body.getFolderId(), body.getFileIds());
        // 207 Multi-Status has no Response.Status constant; use the numeric code directly.
        int status = result.skippedFileIds().isEmpty() ? Response.Status.OK.getStatusCode() : 207;
        return Response.status(status)
                .entity(new BulkMoveResponse(result.movedFileIds(), result.skippedFileIds()))
                .build();
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
