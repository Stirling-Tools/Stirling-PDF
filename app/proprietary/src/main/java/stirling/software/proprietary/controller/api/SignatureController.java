package stirling.software.proprietary.controller.api;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.proprietary.model.api.signature.SavedSignatureRequest;
import stirling.software.proprietary.model.api.signature.SavedSignatureResponse;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.SignatureService;

/**
 * Controller for managing user signatures in proprietary/authenticated mode only. Requires user
 * authentication and enforces per-user storage limits. All endpoints require authentication
 * via @PreAuthorize("isAuthenticated()").
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/proprietary/signatures")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class SignatureController {

    private final SignatureService signatureService;
    private final UserService userService;
    private static final String ALL_USERS_FOLDER = "ALL_USERS";

    /**
     * Save a new signature for the authenticated user. Enforces storage limits and authentication
     * requirements.
     */
    @PostMapping
    public ResponseEntity<SavedSignatureResponse> saveSignature(
            @RequestBody SavedSignatureRequest request) {
        try {
            String username = userService.getCurrentUsername();

            // Validate request
            if (request.getDataUrl() == null || request.getDataUrl().isEmpty()) {
                log.warn("User {} attempted to save signature without dataUrl", username);
                return ResponseEntity.badRequest().build();
            }

            SavedSignatureResponse response = signatureService.saveSignature(username, request);
            log.info("User {} saved signature {}", username, request.getId());
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            log.warn("Invalid signature save request: {}", e.getMessage());
            return ResponseEntity.badRequest().build();
        } catch (IOException e) {
            log.error("Failed to save signature", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * List all signatures accessible to the authenticated user. Includes both personal and shared
     * signatures.
     */
    @GetMapping
    public ResponseEntity<List<SavedSignatureResponse>> listSignatures() {
        try {
            String username = userService.getCurrentUsername();
            List<SavedSignatureResponse> signatures = signatureService.getSavedSignatures(username);
            return ResponseEntity.ok(signatures);
        } catch (IOException e) {
            log.error("Failed to list signatures for user", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    /**
     * Update a signature label. Users can update labels for their own personal signatures and for
     * shared signatures.
     */
    @PostMapping("/{signatureId}/label")
    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    public ResponseEntity<Void> updateSignatureLabel(
            @PathVariable String signatureId, @RequestBody Map<String, String> body) {
        try {
            String username = userService.getCurrentUsername();
            String newLabel = body.get("label");

            if (newLabel == null || newLabel.trim().isEmpty()) {
                log.warn("Invalid label update request");
                return ResponseEntity.badRequest().build();
            }

            signatureService.updateSignatureLabel(username, signatureId, newLabel);
            log.info("User {} updated label for signature {}", username, signatureId);
            return ResponseEntity.noContent().build();
        } catch (IOException e) {
            log.warn("Failed to update signature label: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
    }

    /**
     * Delete a signature owned by the authenticated user. Users can delete their own personal
     * signatures. Admins can also delete shared signatures.
     */
    @DeleteMapping("/{signatureId}")
    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    public ResponseEntity<Void> deleteSignature(@PathVariable String signatureId) {
        try {
            String username = userService.getCurrentUsername();
            boolean isAdmin = userService.isCurrentUserAdmin();

            // Validate filename to prevent path traversal
            if (signatureId.contains("..")
                    || signatureId.contains("/")
                    || signatureId.contains("\\")) {
                log.warn("Invalid signature ID: {}", signatureId);
                return ResponseEntity.badRequest().build();
            }

            // Try to delete from personal folder first
            try {
                signatureService.deleteSignature(username, signatureId);
                log.info("User {} deleted personal signature {}", username, signatureId);
                return ResponseEntity.noContent().build();
            } catch (IOException e) {
                // If not found in personal folder, check if it's in shared folder
                if (isAdmin) {
                    // Admin can delete from shared folder
                    if (deleteFromSharedFolder(signatureId)) {
                        log.info("Admin {} deleted shared signature {}", username, signatureId);
                        return ResponseEntity.noContent().build();
                    }
                }
                // If not admin or not found in shared folder either, return 404
                throw e;
            }
        } catch (IOException e) {
            log.warn("Failed to delete signature {} for user: {}", signatureId, e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
    }

    /**
     * Delete a signature from the shared (ALL_USERS) folder. Only admins should call this method.
     */
    private boolean deleteFromSharedFolder(String signatureId) throws IOException {
        String signatureBasePath = InstallationPathConfig.getSignaturesPath();
        Path sharedFolder = Paths.get(signatureBasePath, ALL_USERS_FOLDER);
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
