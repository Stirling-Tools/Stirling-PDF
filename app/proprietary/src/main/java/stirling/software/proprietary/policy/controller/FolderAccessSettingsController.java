package stirling.software.proprietary.policy.controller;

import java.util.List;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;

import io.swagger.v3.oas.annotations.Operation;

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
@AdminApi
@PreAuthorize("hasRole('ADMIN')")
@RequiredArgsConstructor
public class FolderAccessSettingsController {

    private final FolderAccessGuard folderAccessGuard;

    @GetMapping("/policies/implied-folder-roots")
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
