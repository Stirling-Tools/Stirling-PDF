package stirling.software.proprietary.storage.controller;

import java.net.URI;
import java.util.List;
import java.util.UUID;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.validation.Valid;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PATCH;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

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
@ApplicationScoped
@Path("/api/v1/storage/folders")
@RequiredArgsConstructor
public class FolderController {

    private final FolderService folderService;

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public List<FolderResponse> listFolders() {
        return folderService.listFolders();
    }

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response createFolder(@Valid CreateFolderRequest request) {
        FolderResponse response = folderService.createFolder(request);
        // 201 Created with Location header - conventional REST. The idempotent re-return path
        // (same id resubmitted) also lands here; treating it as 201 keeps wire semantics simple.
        return Response.status(Response.Status.CREATED)
                .location(URI.create("/api/v1/storage/folders/" + response.id()))
                .entity(response)
                .build();
    }

    @PATCH
    @Path("/{folderId}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response updateFolder(
            @PathParam("folderId") UUID folderId, @Valid UpdateFolderRequest request) {
        return Response.ok(folderService.updateFolder(folderId, request)).build();
    }

    @DELETE
    @Path("/{folderId}")
    @Produces(MediaType.APPLICATION_JSON)
    public Response deleteFolder(@PathParam("folderId") UUID folderId) {
        List<UUID> removed = folderService.deleteFolder(folderId);
        return Response.ok(new DeleteFolderResponse(removed)).build();
    }

    public record DeleteFolderResponse(List<UUID> removedFolderIds) {}
}
