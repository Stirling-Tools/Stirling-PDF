package stirling.software.proprietary.storage.controller;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.storage.model.api.CreateFolderRequest;
import stirling.software.proprietary.storage.model.api.FolderResponse;
import stirling.software.proprietary.storage.model.api.UpdateFolderRequest;
import stirling.software.proprietary.storage.service.FolderService;

/**
 * REST endpoints for user-owned folders. Phase A - no folder-level sharing yet (Phase 3).
 *
 * <p>All operations are scoped to the authenticated user; existing single-file storage endpoints in
 * {@link FileStorageController} are left alone so the cert-signing and standard upload flows are
 * unaffected.
 */
@RestController
@RequestMapping("/api/v1/storage/folders")
@RequiredArgsConstructor
public class FolderController {

    private final FolderService folderService;

    @GetMapping
    public List<FolderResponse> listFolders() {
        return folderService.listFolders();
    }

    @PostMapping
    public ResponseEntity<FolderResponse> createFolder(
            @Valid @RequestBody CreateFolderRequest request) {
        FolderResponse response = folderService.createFolder(request);
        // 201 Created with Location header - conventional REST. The idempotent re-return path
        // (same id resubmitted) also lands here; treating it as 201 keeps wire semantics simple.
        return ResponseEntity.status(HttpStatus.CREATED)
                .location(URI.create("/api/v1/storage/folders/" + response.id()))
                .body(response);
    }

    @PatchMapping("/{folderId}")
    public ResponseEntity<FolderResponse> updateFolder(
            @PathVariable UUID folderId, @Valid @RequestBody UpdateFolderRequest request) {
        return ResponseEntity.ok(folderService.updateFolder(folderId, request));
    }

    @DeleteMapping("/{folderId}")
    public ResponseEntity<DeleteFolderResponse> deleteFolder(@PathVariable UUID folderId) {
        List<UUID> removed = folderService.deleteFolder(folderId);
        return ResponseEntity.ok(new DeleteFolderResponse(removed));
    }

    public record DeleteFolderResponse(List<UUID> removedFolderIds) {}
}
