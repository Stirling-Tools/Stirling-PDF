package stirling.software.proprietary.storage.controller;

import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;

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
import stirling.software.proprietary.storage.model.FileShareAccess;
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
        StoredFile storedFile = fileStorageService.storeFile(user, file);
        return buildResponse(storedFile, user);
    }

    @PutMapping(
            value = "/files/{fileId}",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public StoredFileResponse updateFile(
            @PathVariable Long fileId, @RequestPart("file") MultipartFile file) {
        User user = fileStorageService.requireAuthenticatedUser();
        StoredFile existing = fileStorageService.getOwnedFile(user, fileId);
        StoredFile updated = fileStorageService.replaceFile(user, existing, file);
        return buildResponse(updated, user);
    }

    @GetMapping(value = "/files", produces = MediaType.APPLICATION_JSON_VALUE)
    public List<StoredFileResponse> listFiles() {
        User user = fileStorageService.requireAuthenticatedUser();
        return fileStorageService.listAccessibleFiles(user).stream()
                .sorted(Comparator.comparing(StoredFile::getCreatedAt).reversed())
                .map(file -> buildResponse(file, user))
                .collect(Collectors.toList());
    }

    @GetMapping(value = "/files/{fileId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public StoredFileResponse getFileMetadata(@PathVariable Long fileId) {
        User user = fileStorageService.requireAuthenticatedUser();
        StoredFile file = fileStorageService.getAccessibleFile(user, fileId);
        return buildResponse(file, user);
    }

    @GetMapping("/files/{fileId}/download")
    public ResponseEntity<org.springframework.core.io.Resource> downloadFile(
            @PathVariable Long fileId,
            @RequestParam(name = "inline", defaultValue = "false") boolean inline) {
        User user = fileStorageService.requireAuthenticatedUser();
        StoredFile file = fileStorageService.getAccessibleFile(user, fileId);
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
        StoredFile file = fileStorageService.getOwnedFile(owner, fileId);
        if (request == null || request.getUsername() == null || request.getUsername().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Username is required");
        }
        fileStorageService.shareWithUser(owner, file, request.getUsername());
        return buildResponse(fileStorageService.getOwnedFile(owner, fileId), owner);
    }

    @DeleteMapping("/files/{fileId}/shares/users/{username}")
    public ResponseEntity<Void> revokeUserShare(
            @PathVariable Long fileId, @PathVariable String username) {
        User owner = fileStorageService.requireAuthenticatedUser();
        StoredFile file = fileStorageService.getOwnedFile(owner, fileId);
        fileStorageService.revokeUserShare(owner, file, username);
        return ResponseEntity.noContent().build();
    }

    @PostMapping(
            value = "/files/{fileId}/shares/links",
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ShareLinkResponse createShareLink(
            @PathVariable Long fileId, @RequestBody CreateShareLinkRequest request) {
        User owner = fileStorageService.requireAuthenticatedUser();
        StoredFile file = fileStorageService.getOwnedFile(owner, fileId);
        boolean publicLink = request != null && request.isPublicLink();
        FileShare share = fileStorageService.createShareLink(owner, file, publicLink);
        return ShareLinkResponse.builder()
                .token(share.getShareToken())
                .publicLink(share.isPublicLink())
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
        FileShare share = fileStorageService.getShareByToken(token);
        if (!fileStorageService.canAccessShareLink(share, authentication)) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED, "Authentication required for this share link");
        }
        fileStorageService.recordShareAccess(share, authentication, inline);
        StoredFile file = share.getFile();
        return buildFileResponse(file, inline);
    }

    @GetMapping("/share-links/{token}/metadata")
    public ShareLinkMetadataResponse getShareLinkMetadata(
            @PathVariable String token, Authentication authentication) {
        FileShare share = fileStorageService.getShareByToken(token);
        if (!fileStorageService.canAccessShareLink(share, authentication)) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED, "Authentication required for this share link");
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
                .publicLink(share.isPublicLink())
                .createdAt(share.getCreatedAt())
                .build();
    }

    @GetMapping("/share-links/accessed")
    public List<ShareLinkMetadataResponse> listAccessedShareLinks() {
        User user = fileStorageService.requireAuthenticatedUser();
        List<FileShareAccess> accesses = fileStorageService.listAccessedShareLinks(user);
        return accesses.stream()
                .map(
                        access -> {
                            FileShare share = access.getFileShare();
                            StoredFile file = share != null ? share.getFile() : null;
                            boolean ownedByCurrentUser =
                                    file != null
                                            && file.getOwner() != null
                                            && file.getOwner().getId().equals(user.getId());
                            return ShareLinkMetadataResponse.builder()
                                    .shareToken(share != null ? share.getShareToken() : null)
                                    .fileId(file != null ? file.getId() : null)
                                    .fileName(file != null ? file.getOriginalFilename() : null)
                                    .owner(file != null && file.getOwner() != null
                                            ? file.getOwner().getUsername()
                                            : null)
                                    .ownedByCurrentUser(ownedByCurrentUser)
                                    .publicLink(share != null && share.isPublicLink())
                                    .createdAt(share != null ? share.getCreatedAt() : null)
                                    .lastAccessedAt(access.getAccessedAt())
                                    .build();
                        })
                .filter(response -> response.getShareToken() != null)
                .collect(Collectors.toList());
    }

    @GetMapping("/files/{fileId}/shares/links/{token}/accesses")
    public List<ShareLinkAccessResponse> listShareAccesses(
            @PathVariable Long fileId, @PathVariable String token) {
        User owner = fileStorageService.requireAuthenticatedUser();
        StoredFile file = fileStorageService.getOwnedFile(owner, fileId);
        List<FileShareAccess> accesses = fileStorageService.listShareAccesses(owner, file, token);
        return accesses.stream()
                .map(
                        access ->
                                ShareLinkAccessResponse.builder()
                                        .username(
                                                access.getUser() != null
                                                        ? access.getUser().getUsername()
                                                        : null)
                                        .accessType(access.getAccessType().name())
                                        .accessedAt(access.getAccessedAt())
                                        .build())
                .collect(Collectors.toList());
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

    private StoredFileResponse buildResponse(StoredFile file, User currentUser) {
        boolean ownedByCurrentUser =
                file.getOwner() != null
                        && Objects.equals(file.getOwner().getId(), currentUser.getId());
        List<String> sharedWithUsers =
                ownedByCurrentUser
                        ? file.getShares().stream()
                                .map(FileShare::getSharedWithUser)
                                .filter(Objects::nonNull)
                                .map(User::getUsername)
                                .sorted(String.CASE_INSENSITIVE_ORDER)
                                .collect(Collectors.toList())
                        : List.of();
        List<ShareLinkResponse> shareLinks =
                ownedByCurrentUser
                        ? file.getShares().stream()
                                .filter(share -> share.getShareToken() != null)
                                .map(
                                        share ->
                                                ShareLinkResponse.builder()
                                                        .token(share.getShareToken())
                                                        .publicLink(share.isPublicLink())
                                                        .createdAt(share.getCreatedAt())
                                                        .build())
                                .sorted(Comparator.comparing(ShareLinkResponse::getCreatedAt))
                                .collect(Collectors.toList())
                        : List.of();
        return StoredFileResponse.builder()
                .id(file.getId())
                .fileName(file.getOriginalFilename())
                .contentType(file.getContentType())
                .sizeBytes(file.getSizeBytes())
                .owner(file.getOwner() != null ? file.getOwner().getUsername() : null)
                .ownedByCurrentUser(ownedByCurrentUser)
                .createdAt(file.getCreatedAt())
                .updatedAt(file.getUpdatedAt())
                .sharedWithUsers(sharedWithUsers)
                .shareLinks(shareLinks)
                .build();
    }
}
