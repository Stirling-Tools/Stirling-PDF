package stirling.software.proprietary.storage.controller;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.service.AuditService;
import stirling.software.proprietary.storage.egress.ShareEgressDecision;
import stirling.software.proprietary.storage.egress.ShareEgressException;
import stirling.software.proprietary.storage.egress.ShareEgressProcessor;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.model.api.CreateShareLinkRequest;
import stirling.software.proprietary.storage.model.api.ShareLinkAccessResponse;
import stirling.software.proprietary.storage.model.api.ShareLinkMetadataResponse;
import stirling.software.proprietary.storage.model.api.ShareLinkResponse;
import stirling.software.proprietary.storage.model.api.ShareWithUserRequest;
import stirling.software.proprietary.storage.model.api.StoredFileResponse;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.service.FileStorageService;

@RestController
@RequestMapping("/api/v1/storage")
@RequiredArgsConstructor
@Slf4j
@Tag(
        name = "File Storage",
        description = "Stored file management, sharing, and share link operations")
public class FileStorageController {

    private static final Duration SIGNED_URL_TTL = Duration.ofMinutes(5);

    private final FileStorageService fileStorageService;
    private final StorageProvider storageProvider;
    private final ShareEgressProcessor shareEgressProcessor;
    private final AuditService auditService;

    @PostMapping(
            value = "/files",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public StoredFileResponse uploadFile(
            @RequestPart("file") MultipartFile file,
            @RequestPart(name = "historyBundle", required = false) MultipartFile historyBundle,
            @RequestPart(name = "auditLog", required = false) MultipartFile auditLog) {
        User user = fileStorageService.requireAuthenticatedUser();
        return fileStorageService.storeFileResponse(user, file, historyBundle, auditLog);
    }

    @PutMapping(
            value = "/files/{fileId}",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public StoredFileResponse updateFile(
            @PathVariable Long fileId,
            @RequestPart("file") MultipartFile file,
            @RequestPart(name = "historyBundle", required = false) MultipartFile historyBundle,
            @RequestPart(name = "auditLog", required = false) MultipartFile auditLog) {
        User user = fileStorageService.requireAuthenticatedUser();
        return fileStorageService.updateFileResponse(user, fileId, file, historyBundle, auditLog);
    }

    @GetMapping(value = "/files", produces = MediaType.APPLICATION_JSON_VALUE)
    public List<StoredFileResponse> listFiles() {
        User user = fileStorageService.requireAuthenticatedUser();
        return fileStorageService.listAccessibleFileResponses(user);
    }

    @GetMapping(value = "/files/{fileId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public StoredFileResponse getFileMetadata(@PathVariable Long fileId) {
        User user = fileStorageService.requireAuthenticatedUser();
        return fileStorageService.getAccessibleFileResponse(user, fileId);
    }

    @GetMapping("/files/{fileId}/download")
    public ResponseEntity<org.springframework.core.io.Resource> downloadFile(
            @PathVariable Long fileId,
            @RequestParam(name = "inline", defaultValue = "false") boolean inline) {
        User user = fileStorageService.requireAuthenticatedUser();
        StoredFile file = fileStorageService.getAccessibleFile(user, fileId);
        fileStorageService.requireReadAccess(user, file);
        // A recipient fetching a file shared with them is egress; the owner fetching their own is
        // not, and findUserShare returns empty for them.
        Optional<FileShare> share = fileStorageService.findUserShare(user, file);
        if (share.isPresent()) {
            return deliverUnderPolicy(share.get(), file, user, inline);
        }
        Optional<ResponseEntity<org.springframework.core.io.Resource>> redirect =
                tryRedirectToSignedUrl(file, inline);
        return redirect.orElseGet(() -> buildFileResponse(file, inline));
    }

    @DeleteMapping("/files/{fileId}")
    public ResponseEntity<Void> deleteFile(@PathVariable Long fileId) {
        User user = fileStorageService.requireAuthenticatedUser();
        StoredFile file = fileStorageService.getOwnedFile(user, fileId);
        fileStorageService.deleteFile(user, file);
        return ResponseEntity.noContent().build();
    }

    @PostMapping(
            value = "/files/{fileId}/shares/users",
            produces = MediaType.APPLICATION_JSON_VALUE)
    public StoredFileResponse shareWithUser(
            @PathVariable Long fileId, @RequestBody ShareWithUserRequest request) {
        User owner = fileStorageService.requireAuthenticatedUser();
        if (request == null || request.getUsername() == null || request.getUsername().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Username is required");
        }
        return fileStorageService.shareWithUserResponse(
                owner,
                fileId,
                request.getUsername(),
                fileStorageService.normalizeShareRole(request.getAccessRole()));
    }

    @DeleteMapping("/files/{fileId}/shares/users/{username}")
    public ResponseEntity<Void> revokeUserShare(
            @PathVariable Long fileId, @PathVariable String username) {
        User owner = fileStorageService.requireAuthenticatedUser();
        StoredFile file = fileStorageService.getOwnedFile(owner, fileId);
        fileStorageService.revokeUserShare(owner, file, username);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/files/{fileId}/shares/self")
    public ResponseEntity<Void> leaveUserShare(@PathVariable Long fileId) {
        User user = fileStorageService.requireAuthenticatedUser();
        StoredFile file = fileStorageService.getAccessibleFile(user, fileId);
        fileStorageService.leaveUserShare(user, file);
        return ResponseEntity.noContent().build();
    }

    @PostMapping(
            value = "/files/{fileId}/shares/links",
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ShareLinkResponse createShareLink(
            @PathVariable Long fileId, @RequestBody CreateShareLinkRequest request) {
        User owner = fileStorageService.requireAuthenticatedUser();
        StoredFile file = fileStorageService.getOwnedFile(owner, fileId);
        FileShare share =
                fileStorageService.createShareLink(
                        owner,
                        file,
                        fileStorageService.normalizeShareRole(
                                request != null ? request.getAccessRole() : null));
        return ShareLinkResponse.builder()
                .token(share.getShareToken())
                .accessRole(
                        share.getAccessRole() != null
                                ? share.getAccessRole().name().toLowerCase(Locale.ROOT)
                                : null)
                .createdAt(share.getCreatedAt())
                .expiresAt(share.getExpiresAt())
                .build();
    }

    @DeleteMapping("/files/{fileId}/shares/links/{token}")
    public ResponseEntity<Void> revokeShareLink(
            @PathVariable Long fileId, @PathVariable String token) {
        User owner = fileStorageService.requireAuthenticatedUser();
        StoredFile file = fileStorageService.getOwnedFile(owner, fileId);
        fileStorageService.revokeShareLink(owner, file, token);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/share-links/{token}")
    public ResponseEntity<org.springframework.core.io.Resource> downloadShareLink(
            @PathVariable String token,
            Authentication authentication,
            @RequestParam(name = "inline", defaultValue = "false") boolean inline) {
        fileStorageService.ensureShareLinksEnabled();
        FileShare share = fileStorageService.getShareByToken(token);
        if (!fileStorageService.canAccessShareLink(share, authentication)) {
            HttpStatus status =
                    isAuthenticated(authentication)
                            ? HttpStatus.FORBIDDEN
                            : HttpStatus.UNAUTHORIZED;
            String message =
                    status == HttpStatus.FORBIDDEN
                            ? "Access denied for this share link"
                            : "Authentication required for this share link";
            throw new ResponseStatusException(status, message);
        }
        fileStorageService.requireReadAccess(share);
        User accessor =
                authentication != null && authentication.getPrincipal() instanceof User user
                        ? user
                        : null;
        return deliverUnderPolicy(share, share.getFile(), accessor, inline, authentication);
    }

    @GetMapping("/share-links/{token}/metadata")
    public ShareLinkMetadataResponse getShareLinkMetadata(
            @PathVariable String token, Authentication authentication) {
        fileStorageService.ensureShareLinksEnabled();
        FileShare share = fileStorageService.getShareByToken(token);
        if (!fileStorageService.canAccessShareLink(share, authentication)) {
            HttpStatus status =
                    isAuthenticated(authentication)
                            ? HttpStatus.FORBIDDEN
                            : HttpStatus.UNAUTHORIZED;
            String message =
                    status == HttpStatus.FORBIDDEN
                            ? "Access denied for this share link"
                            : "Authentication required for this share link";
            throw new ResponseStatusException(status, message);
        }
        StoredFile file = share.getFile();
        User currentUser = fileStorageService.requireAuthenticatedUser();
        boolean ownedByCurrentUser =
                currentUser != null
                        && file.getOwner() != null
                        && currentUser.getId().equals(file.getOwner().getId());
        return ShareLinkMetadataResponse.builder()
                .shareToken(share.getShareToken())
                .fileId(file.getId())
                .fileName(file.getOriginalFilename())
                .owner(file.getOwner() != null ? file.getOwner().getUsername() : null)
                .ownedByCurrentUser(ownedByCurrentUser)
                .accessRole(
                        share.getAccessRole() != null
                                ? share.getAccessRole().name().toLowerCase(Locale.ROOT)
                                : null)
                .createdAt(share.getCreatedAt())
                .expiresAt(share.getExpiresAt())
                .build();
    }

    @GetMapping("/share-links/accessed")
    public List<ShareLinkMetadataResponse> listAccessedShareLinks() {
        fileStorageService.ensureShareLinksEnabled();
        User user = fileStorageService.requireAuthenticatedUser();
        return fileStorageService.listAccessedShareLinkResponses(user);
    }

    @GetMapping("/files/{fileId}/shares/links/{token}/accesses")
    public List<ShareLinkAccessResponse> listShareAccesses(
            @PathVariable Long fileId, @PathVariable String token) {
        fileStorageService.ensureShareLinksEnabled();
        User owner = fileStorageService.requireAuthenticatedUser();
        StoredFile file = fileStorageService.getOwnedFile(owner, fileId);
        return fileStorageService.listShareAccessResponses(owner, file, token);
    }

    /** Serves a shared document under the owner team's Sharing policies. */
    private ResponseEntity<org.springframework.core.io.Resource> deliverUnderPolicy(
            FileShare share, StoredFile file, User accessor, boolean inline) {
        return deliverUnderPolicy(share, file, accessor, inline, null);
    }

    private ResponseEntity<org.springframework.core.io.Resource> deliverUnderPolicy(
            FileShare share,
            StoredFile file,
            User accessor,
            boolean inline,
            Authentication shareLinkAuth) {
        ShareEgressDecision decision = fileStorageService.decideDelivery(share, accessor);
        if (!decision.allowed()) {
            throw new ShareEgressException(decision);
        }
        // `inline` is a client hint. Under a view-only policy the server picks the disposition
        // instead, so appending ?inline cannot decide whether the policy applies.
        boolean servedInline = inline || decision.viewOnly();
        // Record the access only once the policy has let it through, so a refused attempt does not
        // appear in the owner's access log as a successful view.
        if (shareLinkAuth != null) {
            fileStorageService.recordShareAccess(share, shareLinkAuth, servedInline);
        }
        if (!decision.requiresManagedDelivery()) {
            Optional<ResponseEntity<org.springframework.core.io.Resource>> redirect =
                    tryRedirectToSignedUrl(file, servedInline);
            if (redirect.isPresent()) {
                return redirect.get();
            }
            return buildFileResponse(file, servedInline);
        }
        // A signed URL would point straight at the stored object, bypassing both the processed copy
        // and the view-only disposition, so managed deliveries always stream through here.
        org.springframework.core.io.Resource stored = fileStorageService.loadFile(file);
        org.springframework.core.io.Resource served =
                shareEgressProcessor.resolve(share, stored, decision);
        return buildFileResponse(file, served, servedInline);
    }

    private ResponseEntity<org.springframework.core.io.Resource> buildFileResponse(
            StoredFile file, boolean inline) {
        return buildFileResponse(file, fileStorageService.loadFile(file), inline);
    }

    private ResponseEntity<org.springframework.core.io.Resource> buildFileResponse(
            StoredFile file, org.springframework.core.io.Resource resource, boolean inline) {
        if (file.getEncryptionKeyId() != null) {
            // Compliance marker: a plaintext copy of encrypted-at-rest content left the platform
            // (inline=true is an in-app view; false is a saved download).
            auditService.audit(
                    AuditEventType.STORAGE_ENCRYPTION,
                    Map.of(
                            "action",
                            "plaintextExport",
                            "fileId",
                            file.getId(),
                            "inline",
                            inline,
                            "keyId",
                            file.getEncryptionKeyId()));
        }
        String contentType =
                file.getContentType() == null
                        ? MediaType.APPLICATION_OCTET_STREAM_VALUE
                        : file.getContentType();
        ContentDisposition disposition =
                ContentDisposition.builder(inline ? "inline" : "attachment")
                        .filename(file.getOriginalFilename())
                        .build();
        HttpHeaders headers = new HttpHeaders();
        headers.setContentDisposition(disposition);
        try {
            headers.setContentType(MediaType.parseMediaType(contentType));
        } catch (IllegalArgumentException ex) {
            headers.setContentType(MediaType.APPLICATION_OCTET_STREAM);
        }
        // A processed copy is a different size from the stored original, so take the length from
        // the resource actually being served and fall back to the record only if it can't say.
        long length = file.getSizeBytes();
        try {
            length = resource.contentLength();
        } catch (IOException e) {
            log.debug("Could not size the served resource; using the stored size", e);
        }
        headers.setContentLength(length);
        return ResponseEntity.ok().headers(headers).body(resource);
    }

    private boolean isAuthenticated(Authentication authentication) {
        return authentication != null
                && authentication.isAuthenticated()
                && !"anonymousUser".equals(authentication.getPrincipal());
    }

    private Optional<ResponseEntity<org.springframework.core.io.Resource>> tryRedirectToSignedUrl(
            StoredFile file, boolean inline) {
        if (file == null || file.getStorageKey() == null || file.getStorageKey().isBlank()) {
            return Optional.empty();
        }
        try {
            Optional<URI> signed =
                    storageProvider.signedDownloadUrl(
                            file.getStorageKey(),
                            SIGNED_URL_TTL,
                            inline,
                            file.getOriginalFilename());
            if (signed.isEmpty()) {
                return Optional.empty();
            }
            HttpHeaders headers = new HttpHeaders();
            headers.setLocation(signed.get());
            ResponseEntity<org.springframework.core.io.Resource> response =
                    ResponseEntity.status(HttpStatus.FOUND).headers(headers).build();
            return Optional.of(response);
        } catch (IOException e) {
            log.warn(
                    "Failed to create signed download URL for file {} (key: {}), falling back to streaming",
                    file.getId(),
                    file.getStorageKey(),
                    e);
            return Optional.empty();
        }
    }
}
