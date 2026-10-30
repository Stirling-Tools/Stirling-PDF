package stirling.software.proprietary.storage.controller;

import java.io.IOException;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.eclipse.jetty.ee11.servlet.ServletApiResponse;
import org.eclipse.jetty.server.Response;
import org.eclipse.jetty.util.Blocker;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
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
import org.springframework.web.util.WebUtils;

import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.service.AuditService;
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

    private static final int DIRECT_BUFFER_BYTES = 1024 * 1024;

    private static final Duration SIGNED_URL_TTL = Duration.ofMinutes(5);

    private final FileStorageService fileStorageService;
    private final StorageProvider storageProvider;
    private final AuditService auditService;
    private final ApplicationProperties applicationProperties;

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

    /** Stores a hidden working copy for later {@code storage:<id>} references. */
    @PostMapping(
            value = "/files/temporary",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public StoredFileResponse uploadTemporaryFile(
            @RequestPart("file") MultipartFile file,
            @RequestParam(name = "ttlMinutes", defaultValue = "60") long ttlMinutes) {
        User user = fileStorageService.requireAuthenticatedUser();
        Duration ttl = Duration.ofMinutes(Math.clamp(ttlMinutes, 1, 24 * 60));
        return fileStorageService.storeTemporaryFileResponse(user, file, ttl);
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
    public ResponseEntity<Resource> downloadFile(
            @PathVariable Long fileId,
            @RequestParam(name = "inline", defaultValue = "false") boolean inline,
            @RequestParam(name = "direct", defaultValue = "true") boolean direct,
            HttpServletRequest request,
            HttpServletResponse response)
            throws IOException {
        User user = fileStorageService.requireAuthenticatedUser();
        StoredFile file = fileStorageService.getAccessibleFile(user, fileId);
        fileStorageService.requireReadAccess(user, file);
        Optional<ResponseEntity<Resource>> redirect = tryRedirectToSignedUrl(file, inline);
        if (redirect.isPresent()) {
            return redirect.get();
        }

        // Range and HEAD stay on Spring's converter: it implements 206/Content-Range, and a
        // partial body has no benefit from the whole-file direct path.
        boolean canWriteDirect =
                direct
                        && request.getHeader(HttpHeaders.RANGE) == null
                        && !"HEAD".equalsIgnoreCase(request.getMethod())
                        && WebUtils.getNativeResponse(response, ServletApiResponse.class) != null;
        if (canWriteDirect) {
            Resource resource = fileStorageService.loadFile(file);
            if (resource instanceof FileSystemResource fileSystemResource) {
                writeDirect(response, fileSystemResource.getFile().toPath(), file, inline, request);
                return null;
            }
            return buildFileResponse(file, inline, resource);
        }
        return buildFileResponse(file, inline);
    }

    private void prepareDirectResponse(
            HttpServletResponse servletResponse,
            StoredFile file,
            boolean inline,
            long size,
            HttpServletRequest request) {
        String contentType =
                file.getContentType() == null
                        ? MediaType.APPLICATION_OCTET_STREAM_VALUE
                        : file.getContentType();
        servletResponse.setStatus(HttpStatus.OK.value());
        try {
            servletResponse.setContentType(contentType);
        } catch (IllegalArgumentException ex) {
            servletResponse.setContentType(MediaType.APPLICATION_OCTET_STREAM_VALUE);
        }
        servletResponse.setContentLengthLong(size);
        servletResponse.setHeader(
                HttpHeaders.CONTENT_DISPOSITION,
                ContentDisposition.builder(inline ? "inline" : "attachment")
                        .filename(file.getOriginalFilename())
                        .build()
                        .toString());
        servletResponse.setHeader(HttpHeaders.ACCEPT_RANGES, "bytes");
        applySecurityHeaders(servletResponse, request);
    }

    /** Streams a local file with one direct buffer; the blocking callback bounds in-flight data. */
    private void writeDirect(
            HttpServletResponse servletResponse,
            Path path,
            StoredFile file,
            boolean inline,
            HttpServletRequest request)
            throws IOException {
        ServletApiResponse jettyResponse =
                WebUtils.getNativeResponse(servletResponse, ServletApiResponse.class);
        if (jettyResponse == null) {
            throw new IllegalStateException("Direct download requires a Jetty response");
        }

        Response response = jettyResponse.getResponse();
        try (FileChannel channel = FileChannel.open(path, StandardOpenOption.READ)) {
            long size = channel.size();
            prepareDirectResponse(servletResponse, file, inline, size, request);
            if (size == 0) {
                try (Blocker.Callback callback = Blocker.callback()) {
                    response.write(true, ByteBuffer.allocate(0), callback);
                    callback.block();
                }
                return;
            }
            ByteBuffer buffer = ByteBuffer.allocateDirect(DIRECT_BUFFER_BYTES);
            long remaining = size;
            while (remaining > 0) {
                buffer.clear();
                buffer.limit((int) Math.min(buffer.capacity(), remaining));
                int read = channel.read(buffer);
                if (read < 0) {
                    break;
                }
                if (read == 0) {
                    continue;
                }
                buffer.flip();
                remaining -= read;
                try (Blocker.Callback callback = Blocker.callback()) {
                    response.write(remaining == 0, buffer, callback);
                    callback.block();
                }
            }
        }
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
    public ResponseEntity<Resource> downloadShareLink(
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
        fileStorageService.recordShareAccess(share, authentication, inline);
        StoredFile file = share.getFile();
        Optional<ResponseEntity<Resource>> redirect = tryRedirectToSignedUrl(file, inline);
        return redirect.orElseGet(() -> buildFileResponse(file, inline));
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

    private ResponseEntity<Resource> buildFileResponse(StoredFile file, boolean inline) {
        return buildFileResponse(file, inline, fileStorageService.loadFile(file));
    }

    private ResponseEntity<Resource> buildFileResponse(
            StoredFile file, boolean inline, Resource resource) {
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
        headers.setContentLength(file.getSizeBytes());
        return ResponseEntity.ok().headers(headers).body(resource);
    }

    /**
     * Direct writes skip Spring Security's on-commit headers; mirror them in step with
     * SecurityConfiguration.
     */
    private void applySecurityHeaders(HttpServletResponse response, HttpServletRequest request) {
        response.setHeader("X-Content-Type-Options", "nosniff");
        ApplicationProperties.Security security = applicationProperties.getSecurity();
        if (security != null && security.isEnableLogin()) {
            String frame = security.getXFrameOptions();
            if (frame == null || frame.isBlank() || "DENY".equalsIgnoreCase(frame)) {
                response.setHeader("X-Frame-Options", "DENY");
            } else if ("SAMEORIGIN".equalsIgnoreCase(frame)) {
                response.setHeader("X-Frame-Options", "SAMEORIGIN");
            }
        }
        if (request.isSecure()) {
            response.setHeader("Strict-Transport-Security", "max-age=31536000 ; includeSubDomains");
        }
    }

    private boolean isAuthenticated(Authentication authentication) {
        return authentication != null
                && authentication.isAuthenticated()
                && !"anonymousUser".equals(authentication.getPrincipal());
    }

    private Optional<ResponseEntity<Resource>> tryRedirectToSignedUrl(
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
            ResponseEntity<Resource> response =
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
