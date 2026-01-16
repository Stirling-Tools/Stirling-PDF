package stirling.software.proprietary.storage.controller;

import java.util.List;
import java.util.Locale;

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

import lombok.RequiredArgsConstructor;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.model.api.CreateShareLinkRequest;
import stirling.software.proprietary.storage.model.api.ShareLinkAccessResponse;
import stirling.software.proprietary.storage.model.api.ShareLinkMetadataResponse;
import stirling.software.proprietary.storage.model.api.ShareLinkResponse;
import stirling.software.proprietary.storage.model.api.ShareWithUserRequest;
import stirling.software.proprietary.storage.model.api.StoredFileResponse;
import stirling.software.proprietary.storage.service.FileStorageService;

@RestController
@RequestMapping("/api/v1/storage")
@RequiredArgsConstructor
public class FileStorageController {

    private final FileStorageService fileStorageService;

    @PostMapping(
            value = "/files",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public StoredFileResponse uploadFile(@RequestPart("file") MultipartFile file) {
        User user = fileStorageService.requireAuthenticatedUser();
        return fileStorageService.storeFileResponse(user, file);
    }

    @PutMapping(
            value = "/files/{fileId}",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public StoredFileResponse updateFile(
            @PathVariable Long fileId, @RequestPart("file") MultipartFile file) {
        User user = fileStorageService.requireAuthenticatedUser();
        return fileStorageService.updateFileResponse(user, fileId, file);
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
        fileStorageService.requireEditorAccess(user, file);
        return buildFileResponse(file, inline);
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
                    isAuthenticated(authentication) ? HttpStatus.FORBIDDEN : HttpStatus.UNAUTHORIZED;
            String message =
                    status == HttpStatus.FORBIDDEN
                            ? "Access denied for this share link"
                            : "Authentication required for this share link";
            throw new ResponseStatusException(status, message);
        }
        fileStorageService.requireEditorAccess(share);
        fileStorageService.recordShareAccess(share, authentication, inline);
        StoredFile file = share.getFile();
        return buildFileResponse(file, inline);
    }

    @GetMapping("/share-links/{token}/metadata")
    public ShareLinkMetadataResponse getShareLinkMetadata(
            @PathVariable String token, Authentication authentication) {
        fileStorageService.ensureShareLinksEnabled();
        FileShare share = fileStorageService.getShareByToken(token);
        if (!fileStorageService.canAccessShareLink(share, authentication)) {
            HttpStatus status =
                    isAuthenticated(authentication) ? HttpStatus.FORBIDDEN : HttpStatus.UNAUTHORIZED;
            String message =
                    status == HttpStatus.FORBIDDEN
                            ? "Access denied for this share link"
                            : "Authentication required for this share link";
            throw new ResponseStatusException(status, message);
        }
        StoredFile file = share.getFile();
        User currentUser = null;
        try {
            currentUser = fileStorageService.requireAuthenticatedUser();
        } catch (ResponseStatusException ignored) {
            // ignore if not authenticated (public link)
        }
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

    private ResponseEntity<org.springframework.core.io.Resource> buildFileResponse(
            StoredFile file, boolean inline) {
        org.springframework.core.io.Resource resource = fileStorageService.loadFile(file);
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
        headers.setContentType(MediaType.parseMediaType(contentType));
        headers.setContentLength(file.getSizeBytes());
        return ResponseEntity.ok().headers(headers).body(resource);
    }

    private boolean isAuthenticated(Authentication authentication) {
        return authentication != null
                && authentication.isAuthenticated()
                && !"anonymousUser".equals(authentication.getPrincipal());
    }

}
