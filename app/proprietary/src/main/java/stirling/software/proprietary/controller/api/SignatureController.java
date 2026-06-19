package stirling.software.proprietary.controller.api;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.proprietary.model.api.signature.SavedSignatureRequest;
import stirling.software.proprietary.model.api.signature.SavedSignatureResponse;
import stirling.software.proprietary.security.annotation.DenyDemoUser;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.SignatureService;

/**
 * Controller for managing user signatures in proprietary/authenticated mode only. Requires user
 * authentication and enforces per-user storage limits.
 *
 * <p>TODO: Migration required - the original endpoints were guarded by Spring Security SpEL
 * expressions ({@code @PreAuthorize("isAuthenticated() && !hasAuthority('ROLE_DEMO_USER')")} and
 * {@code @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")}). These are not simple role checks, so
 * they cannot be expressed with {@code @RolesAllowed}. Authentication should be enforced via
 * Quarkus (e.g. inject {@code io.quarkus.security.identity.SecurityIdentity} or add an HTTP auth
 * policy in application.properties), and the DEMO_USER exclusion needs to be re-implemented as a
 * runtime check against the current identity's roles.
 */
@Slf4j
@ApplicationScoped
@jakarta.ws.rs.Path("/api/v1/proprietary/signatures")
@RequiredArgsConstructor
@Tag(
        name = "Saved Signatures",
        description = "Manage saved signature templates for authenticated users")
public class SignatureController {

    private final SignatureService signatureService;
    private final UserService userService;
    private static final String ALL_USERS_FOLDER = "ALL_USERS";

    /**
     * Save a new signature for the authenticated user. Enforces storage limits and authentication
     * requirements.
     */
    @DenyDemoUser
    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response saveSignature(SavedSignatureRequest request) {
        try {
            String username = userService.getCurrentUsername();

            if ("shared".equals(request.getScope()) && !userService.isCurrentUserAdmin()) {
                log.warn(
                        "User {} attempted to create shared signature without admin role",
                        username);
                return Response.status(Response.Status.FORBIDDEN).build();
            }

            // Validate request
            if (request.getDataUrl() == null || request.getDataUrl().isEmpty()) {
                log.warn("User {} attempted to save signature without dataUrl", username);
                return Response.status(Response.Status.BAD_REQUEST).build();
            }

            SavedSignatureResponse response = signatureService.saveSignature(username, request);
            log.info("User {} saved signature {}", username, request.getId());
            return Response.ok(response).build();
        } catch (IllegalArgumentException e) {
            log.warn("Invalid signature save request: {}", e.getMessage());
            return Response.status(Response.Status.BAD_REQUEST).build();
        } catch (IOException e) {
            log.error("Failed to save signature", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * List all signatures accessible to the authenticated user. Includes both personal and shared
     * signatures.
     */
    @DenyDemoUser
    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public Response listSignatures() {
        try {
            String username = userService.getCurrentUsername();
            List<SavedSignatureResponse> signatures = signatureService.getSavedSignatures(username);
            return Response.ok(signatures).build();
        } catch (IOException e) {
            log.error("Failed to list signatures for user", e);
            return Response.status(Response.Status.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * Update a signature label. Users can update labels for their own personal signatures and for
     * shared signatures.
     */
    @DenyDemoUser
    @POST
    @jakarta.ws.rs.Path("/{signatureId}/label")
    @Consumes(MediaType.APPLICATION_JSON)
    public Response updateSignatureLabel(
            @PathParam("signatureId") String signatureId, Map<String, String> body) {
        try {
            String username = userService.getCurrentUsername();
            String newLabel = body.get("label");
            boolean isAdmin = userService.isCurrentUserAdmin();

            if (newLabel == null || newLabel.trim().isEmpty()) {
                log.warn("Invalid label update request");
                return Response.status(Response.Status.BAD_REQUEST).build();
            }

            if (signatureService.isSharedSignature(signatureId) && !isAdmin) {
                log.warn(
                        "User {} attempted to update shared signature {} without admin role",
                        username,
                        signatureId);
                return Response.status(Response.Status.FORBIDDEN).build();
            }

            signatureService.updateSignatureLabel(username, signatureId, newLabel);
            log.info("User {} updated label for signature {}", username, signatureId);
            return Response.noContent().build();
        } catch (IOException e) {
            log.warn("Failed to update signature label: {}", e.getMessage());
            return Response.status(Response.Status.NOT_FOUND).build();
        }
    }

    /**
     * Delete a signature owned by the authenticated user. Users can delete their own personal
     * signatures. Admins can also delete shared signatures.
     */
    @DenyDemoUser
    @DELETE
    @jakarta.ws.rs.Path("/{signatureId}")
    public Response deleteSignature(@PathParam("signatureId") String signatureId) {
        try {
            String username = userService.getCurrentUsername();
            boolean isAdmin = userService.isCurrentUserAdmin();

            // Validate filename to prevent path traversal
            if (signatureId.contains("..")
                    || signatureId.contains("/")
                    || signatureId.contains("\\")) {
                log.warn("Invalid signature ID: {}", signatureId);
                return Response.status(Response.Status.BAD_REQUEST).build();
            }

            // Try to delete from personal folder first
            try {
                signatureService.deleteSignature(username, signatureId);
                log.info("User {} deleted personal signature {}", username, signatureId);
                return Response.noContent().build();
            } catch (IOException e) {
                // If not found in personal folder, check if it's in shared folder
                if (isAdmin) {
                    // Admin can delete from shared folder
                    if (deleteFromSharedFolder(signatureId)) {
                        log.info("Admin {} deleted shared signature {}", username, signatureId);
                        return Response.noContent().build();
                    }
                }
                // If not admin or not found in shared folder either, return 404
                throw e;
            }
        } catch (IOException e) {
            log.warn("Failed to delete signature {} for user: {}", signatureId, e.getMessage());
            return Response.status(Response.Status.NOT_FOUND).build();
        }
    }

    /**
     * Delete a signature from the shared (ALL_USERS) folder. Only admins should call this method.
     */
    private boolean deleteFromSharedFolder(String signatureId) throws IOException {
        String signatureBasePath = InstallationPathConfig.getSignaturesPath();
        Path sharedFolder = Path.of(signatureBasePath, ALL_USERS_FOLDER);
        boolean deleted = false;

        if (Files.exists(sharedFolder)) {
            try (Stream<Path> stream = Files.list(sharedFolder)) {
                List<Path> matchingFiles =
                        stream.filter(
                                        path ->
                                                path.getFileName()
                                                        .toString()
                                                        .startsWith(signatureId + "."))
                                .toList();
                for (Path file : matchingFiles) {
                    Files.delete(file);
                    deleted = true;
                    log.info("Deleted shared signature file: {}", file);
                }
            }

            // Also delete metadata file if it exists
            Path metadataPath = sharedFolder.resolve(signatureId + ".json");
            if (Files.exists(metadataPath)) {
                Files.delete(metadataPath);
                log.info("Deleted shared signature metadata: {}", metadataPath);
            }
        }

        return deleted;
    }
}
