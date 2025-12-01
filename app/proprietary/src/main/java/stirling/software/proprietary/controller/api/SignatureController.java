package stirling.software.proprietary.controller.api;

import java.io.IOException;
import java.util.List;

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

import stirling.software.common.annotations.api.UserApi;
import stirling.software.proprietary.model.api.signature.SavedSignatureRequest;
import stirling.software.proprietary.model.api.signature.SavedSignatureResponse;
import stirling.software.proprietary.security.service.UserService;
import stirling.software.proprietary.service.SignatureService;

/**
 * Controller for managing user signatures in proprietary/authenticated mode only. Requires user
 * authentication and enforces per-user storage limits. All endpoints require authentication
 * via @PreAuthorize("isAuthenticated()").
 */
@UserApi
@Slf4j
@RestController
@RequestMapping("/api/v1/proprietary/signatures")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class SignatureController {

    private final SignatureService signatureService;
    private final UserService userService;

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
     * Delete a signature owned by the authenticated user. Users can only delete their own personal
     * signatures, not shared ones.
     */
    @DeleteMapping("/{signatureId}")
    public ResponseEntity<Void> deleteSignature(@PathVariable String signatureId) {
        try {
            String username = userService.getCurrentUsername();
            signatureService.deleteSignature(username, signatureId);
            log.info("User {} deleted signature {}", username, signatureId);
            return ResponseEntity.noContent().build();
        } catch (IOException e) {
            log.warn("Failed to delete signature {} for user: {}", signatureId, e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
    }
}
