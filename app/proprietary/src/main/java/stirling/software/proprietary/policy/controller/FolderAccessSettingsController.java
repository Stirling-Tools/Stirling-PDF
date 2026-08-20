package stirling.software.proprietary.policy.controller;

import java.util.List;

import io.quarkus.arc.profile.IfBuildProfile;
import io.swagger.v3.oas.annotations.Operation;

import jakarta.annotation.security.RolesAllowed;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;

import lombok.RequiredArgsConstructor;

import stirling.software.common.annotations.api.AdminApi;
import stirling.software.proprietary.policy.config.FolderAccessGuard;

/**
 * Read-only admin view of the folder roots that are always permitted for folder automations,
 * regardless of {@code policies.allowedFolderRoots} (server storage, pipeline watched folders). The
 * Folder Access settings section renders these so an admin can see what is implicitly allowed and
 * why, without them being editable. The editable roots themselves live under the {@code policies}
 * settings section.
 */
// @AdminApi carries only the OpenAPI @Tag under JAX-RS, so the base path its former
// @RequestMapping supplied is declared here.
@AdminApi
@ApplicationScoped
@IfBuildProfile("saas")
@Path("/api/v1/admin/settings")
@RolesAllowed("ADMIN")
@RequiredArgsConstructor
public class FolderAccessSettingsController {

    private final FolderAccessGuard folderAccessGuard;

    @GET
    @Path("/policies/implied-folder-roots")
    @Produces(MediaType.APPLICATION_JSON)
    @Operation(
            summary = "Implied folder roots",
            description =
                    "Stirling-managed directories always permitted for folder automations"
                            + " regardless of policies.allowedFolderRoots. Read-only.")
    public List<ImpliedFolderRoot> impliedFolderRoots() {
        return folderAccessGuard.impliedRoots().stream()
                .map(root -> new ImpliedFolderRoot(root.path().toString(), root.reason()))
                .toList();
    }

    public record ImpliedFolderRoot(String path, String reason) {}
}
