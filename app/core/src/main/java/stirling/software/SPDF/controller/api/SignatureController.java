package stirling.software.SPDF.controller.api;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
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

import stirling.software.SPDF.model.api.signature.SavedSignatureRequest;
import stirling.software.SPDF.model.api.signature.SavedSignatureResponse;
import stirling.software.SPDF.service.SignatureService;
import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.service.UserServiceInterface;

/**
 * Controller for managing authenticated user signatures in the free/self-hosted path.
 */
@Slf4j
@RestController
@RequestMapping({"/api/v1/signatures", "/api/v1/proprietary/signatures"})
@RequiredArgsConstructor
@ConditionalOnBean(UserServiceInterface.class)
public class SignatureController {

    private final SignatureService signatureService;
    private final UserServiceInterface userService;
    private static final String ALL_USERS_FOLDER = "ALL_USERS";

    private String getAuthenticatedUsername() {
        String username = userService.getCurrentUsername();
        if (username == null
                || username.isBlank()
                || "anonymousUser".equalsIgnoreCase(username)) {
            return null;
        }
        return username;
    }

    @PostMapping
    @PreAuthorize("isAuthenticated() && !hasAuthority('ROLE_DEMO_USER')")
    public ResponseEntity<SavedSignatureResponse> saveSignature(
            @RequestBody SavedSignatureRequest request) {
        try {
            String username = getAuthenticatedUsername();
            if (username == null) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
            }

            if ("shared".equals(request.getScope()) && !userService.isCurrentUserAdmin()) {
                log.warn(
                        "User {} attempted to create shared signature without admin role",
                        username);
                return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
            }

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

    @GetMapping
    @PreAuthorize("isAuthenticated() && !hasAuthority('ROLE_DEMO_USER')")
    public ResponseEntity<List<SavedSignatureResponse>> listSignatures() {
        try {
            String username = getAuthenticatedUsername();
            if (username == null) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
            }
            List<SavedSignatureResponse> signatures = signatureService.getSavedSignatures(username);
            return ResponseEntity.ok(signatures);
        } catch (IOException e) {
            log.error("Failed to list signatures for user", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }

    @PostMapping("/{signatureId}/label")
    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    public ResponseEntity<Void> updateSignatureLabel(
            @PathVariable String signatureId, @RequestBody Map<String, String> body) {
        try {
            String username = getAuthenticatedUsername();
            if (username == null) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
            }
            String newLabel = body.get("label");
            boolean isAdmin = userService.isCurrentUserAdmin();

            if (newLabel == null || newLabel.strip().isEmpty()) {
                log.warn("Invalid label update request");
                return ResponseEntity.badRequest().build();
            }

            if (signatureService.isSharedSignature(signatureId) && !isAdmin) {
                log.warn(
                        "User {} attempted to update shared signature {} without admin role",
                        username,
                        signatureId);
                return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
            }

            signatureService.updateSignatureLabel(username, signatureId, newLabel);
            log.info("User {} updated label for signature {}", username, signatureId);
            return ResponseEntity.noContent().build();
        } catch (IOException e) {
            log.warn("Failed to update signature label: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
    }

    @DeleteMapping("/{signatureId}")
    @PreAuthorize("!hasAuthority('ROLE_DEMO_USER')")
    public ResponseEntity<Void> deleteSignature(@PathVariable String signatureId) {
        try {
            String username = getAuthenticatedUsername();
            if (username == null) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
            }
            boolean isAdmin = userService.isCurrentUserAdmin();

            if (signatureId.contains("..")
                    || signatureId.contains("/")
                    || signatureId.contains("\\")) {
                log.warn("Invalid signature ID: {}", signatureId);
                return ResponseEntity.badRequest().build();
            }

            if (signatureService.isSharedSignature(signatureId) && !isAdmin) {
                log.warn(
                        "User {} attempted to delete shared signature {} without admin role",
                        username,
                        signatureId);
                return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
            }

            try {
                signatureService.deleteSignature(username, signatureId);
                log.info("User {} deleted signature {}", username, signatureId);
                return ResponseEntity.noContent().build();
            } catch (IOException e) {
                if (isAdmin && deleteFromSharedFolder(signatureId)) {
                    log.info("Admin {} deleted shared signature {}", username, signatureId);
                    return ResponseEntity.noContent().build();
                }
                throw e;
            }
        } catch (IOException e) {
            log.warn("Failed to delete signature {} for user: {}", signatureId, e.getMessage());
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }
    }

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

            Path metadataPath = sharedFolder.resolve(signatureId + ".json");
            if (Files.exists(metadataPath)) {
                Files.delete(metadataPath);
                log.info("Deleted shared signature metadata: {}", metadataPath);
            }
        }

        return deleted;
    }
}
