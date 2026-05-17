package stirling.software.proprietary.storage.controller;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.Folder;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.repository.FolderRepository;
import stirling.software.proprietary.storage.repository.StoredFileRepository;

/**
 * Folder placement endpoints for existing stored files. Sits alongside {@code
 * FileStorageController} so the original controller stays untouched — this controller exists only
 * to add Phase A folder support without risking the cert-signing or default file upload flows.
 */
@RestController
@RequestMapping("/api/v1/storage/files")
@RequiredArgsConstructor
@Slf4j
public class FileFolderPlacementController {

    /**
     * Hard cap on bulk-move payload size. Beyond this we reject with 400 — guards against DoS via
     * unbounded ID lists and bounds the single bulk-update query.
     */
    private static final int BULK_MOVE_MAX_FILES = 1000;

    private final StoredFileRepository storedFileRepository;
    private final FolderRepository folderRepository;

    /** Move a single file to a folder (or to root when folderId is null). */
    @PatchMapping("/{fileId}/folder")
    @Transactional
    public ResponseEntity<Void> moveFileToFolder(
            @PathVariable Long fileId, @Valid @RequestBody FolderPlacement body) {
        User user = requireAuthenticatedUser();
        StoredFile file =
                storedFileRepository
                        .findByIdAndOwner(fileId, user)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND,
                                                "File not found or not owned by current user"));
        file.setFolder(resolveFolder(body.getFolderId(), user));
        storedFileRepository.save(file);
        return ResponseEntity.noContent().build();
    }

    /**
     * Bulk move — fewer round-trips than calling the single endpoint N times. Returns 200 on full
     * success, 207 (Multi-Status) when some files were skipped (typically because they don't belong
     * to the caller).
     */
    @PatchMapping("/folder")
    @Transactional
    public ResponseEntity<BulkMoveResponse> bulkMove(@Valid @RequestBody BulkMoveRequest body) {
        User user = requireAuthenticatedUser();
        Folder target = resolveFolder(body.getFolderId(), user);

        // Single batched read replaces the prior N+1 findByIdAndOwner loop.
        List<StoredFile> owned =
                storedFileRepository.findAllByIdInAndOwner(body.getFileIds(), user);
        Set<Long> ownedIds = new HashSet<>(owned.size());
        for (StoredFile f : owned) {
            f.setFolder(target);
            ownedIds.add(f.getId());
        }
        storedFileRepository.saveAll(owned);

        List<Long> moved = owned.stream().map(StoredFile::getId).toList();
        List<Long> skipped =
                body.getFileIds().stream().filter(id -> !ownedIds.contains(id)).toList();

        if (!skipped.isEmpty()) {
            log.warn(
                    "bulkMove: user {} skipped {} of {} files (not owned or missing)",
                    user.getId(),
                    skipped.size(),
                    body.getFileIds().size());
        }

        HttpStatus status = skipped.isEmpty() ? HttpStatus.OK : HttpStatus.MULTI_STATUS;
        return ResponseEntity.status(status).body(new BulkMoveResponse(moved, skipped));
    }

    private Folder resolveFolder(UUID folderId, User user) {
        if (folderId == null) return null;
        return folderRepository
                .findByIdAndOwner(folderId, user)
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.BAD_REQUEST,
                                        "Folder does not exist or is not owned by you"));
    }

    private User requireAuthenticatedUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null
                || !authentication.isAuthenticated()
                || !(authentication.getPrincipal() instanceof User user)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
        }
        return user;
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
