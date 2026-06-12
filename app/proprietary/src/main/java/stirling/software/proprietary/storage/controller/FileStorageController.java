package stirling.software.proprietary.storage.controller;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

import org.jboss.resteasy.reactive.RestForm;
import org.jboss.resteasy.reactive.multipart.FileUpload;

import io.quarkus.security.identity.SecurityIdentity;
import io.swagger.v3.oas.annotations.tags.Tag;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.StreamingOutput;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.multipart.FileUploadMultipartFile;
import stirling.software.proprietary.security.model.User;
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

// IMPORTANT: this class also references java.nio-style paths indirectly; @jakarta.ws.rs.Path is
// fully-qualified on the class/methods to avoid any clash with collaborator types.
@ApplicationScoped
@jakarta.ws.rs.Path("/api/v1/storage")
@Slf4j
@Tag(
        name = "File Storage",
        description = "Stored file management, sharing, and share link operations")
public class FileStorageController {

    private static final Duration SIGNED_URL_TTL = Duration.ofMinutes(5);

    @Inject FileStorageService fileStorageService;
    @Inject StorageProvider storageProvider;

    // TODO: Migration required - SecurityIdentity replaces Spring's Authentication. The
    // collaborator
    // FileStorageService still exposes canAccessShareLink(FileShare, org.springframework.security
    // .core.Authentication) and recordShareAccess(FileShare, Authentication, boolean). Once that
    // service is migrated those methods should accept SecurityIdentity (or io.quarkus.security
    // SecurityContext) and this injected identity can be passed through directly.
    @Inject SecurityIdentity securityIdentity;

    @POST
    @jakarta.ws.rs.Path("/files")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    public StoredFileResponse uploadFile(
            @RestForm("file") FileUpload file,
            @RestForm("historyBundle") FileUpload historyBundle,
            @RestForm("auditLog") FileUpload auditLog) {
        User user = fileStorageService.requireAuthenticatedUser();
        // TODO: Migration required - storeFileResponse(...) still accepts Spring
        // org.springframework.web.multipart.MultipartFile. Migrate FileStorageService to accept
        // stirling.software.common.model.MultipartFile, then this wrapping is type-compatible.
        return fileStorageService.storeFileResponse(
                user,
                FileUploadMultipartFile.of(file),
                FileUploadMultipartFile.of(historyBundle),
                FileUploadMultipartFile.of(auditLog));
    }

    @PUT
    @jakarta.ws.rs.Path("/files/{fileId}")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    public StoredFileResponse updateFile(
            @jakarta.ws.rs.PathParam("fileId") Long fileId,
            @RestForm("file") FileUpload file,
            @RestForm("historyBundle") FileUpload historyBundle,
            @RestForm("auditLog") FileUpload auditLog) {
        User user = fileStorageService.requireAuthenticatedUser();
        // TODO: Migration required - updateFileResponse(...) still accepts Spring MultipartFile;
        // migrate FileStorageService to stirling.software.common.model.MultipartFile.
        return fileStorageService.updateFileResponse(
                user,
                fileId,
                FileUploadMultipartFile.of(file),
                FileUploadMultipartFile.of(historyBundle),
                FileUploadMultipartFile.of(auditLog));
    }

    @GET
    @jakarta.ws.rs.Path("/files")
    @Produces(MediaType.APPLICATION_JSON)
    public List<StoredFileResponse> listFiles() {
        User user = fileStorageService.requireAuthenticatedUser();
        return fileStorageService.listAccessibleFileResponses(user);
    }

    @GET
    @jakarta.ws.rs.Path("/files/{fileId}")
    @Produces(MediaType.APPLICATION_JSON)
    public StoredFileResponse getFileMetadata(@jakarta.ws.rs.PathParam("fileId") Long fileId) {
        User user = fileStorageService.requireAuthenticatedUser();
        return fileStorageService.getAccessibleFileResponse(user, fileId);
    }

    @GET
    @jakarta.ws.rs.Path("/files/{fileId}/download")
    public Response downloadFile(
            @jakarta.ws.rs.PathParam("fileId") Long fileId,
            @QueryParam("inline") @jakarta.ws.rs.DefaultValue("false") boolean inline) {
        User user = fileStorageService.requireAuthenticatedUser();
        StoredFile file = fileStorageService.getAccessibleFile(user, fileId);
        fileStorageService.requireReadAccess(user, file);
        Optional<Response> redirect = tryRedirectToSignedUrl(file, inline);
        return redirect.orElseGet(() -> buildFileResponse(file, inline));
    }

    @DELETE
    @jakarta.ws.rs.Path("/files/{fileId}")
    public Response deleteFile(@jakarta.ws.rs.PathParam("fileId") Long fileId) {
        User user = fileStorageService.requireAuthenticatedUser();
        StoredFile file = fileStorageService.getOwnedFile(user, fileId);
        fileStorageService.deleteFile(user, file);
        return Response.noContent().build();
    }

    @POST
    @jakarta.ws.rs.Path("/files/{fileId}/shares/users")
    @Produces(MediaType.APPLICATION_JSON)
    public StoredFileResponse shareWithUser(
            @jakarta.ws.rs.PathParam("fileId") Long fileId, ShareWithUserRequest request) {
        User owner = fileStorageService.requireAuthenticatedUser();
        if (request == null || request.getUsername() == null || request.getUsername().isBlank()) {
            throw new WebApplicationException("Username is required", Response.Status.BAD_REQUEST);
        }
        return fileStorageService.shareWithUserResponse(
                owner,
                fileId,
                request.getUsername(),
                fileStorageService.normalizeShareRole(request.getAccessRole()));
    }

    @DELETE
    @jakarta.ws.rs.Path("/files/{fileId}/shares/users/{username}")
    public Response revokeUserShare(
            @jakarta.ws.rs.PathParam("fileId") Long fileId,
            @jakarta.ws.rs.PathParam("username") String username) {
        User owner = fileStorageService.requireAuthenticatedUser();
        StoredFile file = fileStorageService.getOwnedFile(owner, fileId);
        fileStorageService.revokeUserShare(owner, file, username);
        return Response.noContent().build();
    }

    @DELETE
    @jakarta.ws.rs.Path("/files/{fileId}/shares/self")
    public Response leaveUserShare(@jakarta.ws.rs.PathParam("fileId") Long fileId) {
        User user = fileStorageService.requireAuthenticatedUser();
        StoredFile file = fileStorageService.getAccessibleFile(user, fileId);
        fileStorageService.leaveUserShare(user, file);
        return Response.noContent().build();
    }

    @POST
    @jakarta.ws.rs.Path("/files/{fileId}/shares/links")
    @Produces(MediaType.APPLICATION_JSON)
    public ShareLinkResponse createShareLink(
            @jakarta.ws.rs.PathParam("fileId") Long fileId, CreateShareLinkRequest request) {
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

    @DELETE
    @jakarta.ws.rs.Path("/files/{fileId}/shares/links/{token}")
    public Response revokeShareLink(
            @jakarta.ws.rs.PathParam("fileId") Long fileId,
            @jakarta.ws.rs.PathParam("token") String token) {
        User owner = fileStorageService.requireAuthenticatedUser();
        StoredFile file = fileStorageService.getOwnedFile(owner, fileId);
        fileStorageService.revokeShareLink(owner, file, token);
        return Response.noContent().build();
    }

    @GET
    @jakarta.ws.rs.Path("/share-links/{token}")
    public Response downloadShareLink(
            @jakarta.ws.rs.PathParam("token") String token,
            @QueryParam("inline") @jakarta.ws.rs.DefaultValue("false") boolean inline) {
        fileStorageService.ensureShareLinksEnabled();
        FileShare share = fileStorageService.getShareByToken(token);
        // TODO: Migration required - canAccessShareLink/recordShareAccess still take Spring
        // Authentication. Passing null preserves the anonymous-deny behavior until the service is
        // migrated to SecurityIdentity; once migrated, pass `securityIdentity` through instead.
        if (!fileStorageService.canAccessShareLink(share, null)) {
            Response.Status status =
                    isAuthenticated() ? Response.Status.FORBIDDEN : Response.Status.UNAUTHORIZED;
            String message =
                    status == Response.Status.FORBIDDEN
                            ? "Access denied for this share link"
                            : "Authentication required for this share link";
            throw new WebApplicationException(message, status);
        }
        fileStorageService.requireReadAccess(share);
        fileStorageService.recordShareAccess(share, null, inline);
        StoredFile file = share.getFile();
        Optional<Response> redirect = tryRedirectToSignedUrl(file, inline);
        return redirect.orElseGet(() -> buildFileResponse(file, inline));
    }

    @GET
    @jakarta.ws.rs.Path("/share-links/{token}/metadata")
    public ShareLinkMetadataResponse getShareLinkMetadata(
            @jakarta.ws.rs.PathParam("token") String token) {
        fileStorageService.ensureShareLinksEnabled();
        FileShare share = fileStorageService.getShareByToken(token);
        // TODO: Migration required - canAccessShareLink still takes Spring Authentication; pass
        // `securityIdentity` once FileStorageService is migrated.
        if (!fileStorageService.canAccessShareLink(share, null)) {
            Response.Status status =
                    isAuthenticated() ? Response.Status.FORBIDDEN : Response.Status.UNAUTHORIZED;
            String message =
                    status == Response.Status.FORBIDDEN
                            ? "Access denied for this share link"
                            : "Authentication required for this share link";
            throw new WebApplicationException(message, status);
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

    @GET
    @jakarta.ws.rs.Path("/share-links/accessed")
    @Produces(MediaType.APPLICATION_JSON)
    public List<ShareLinkMetadataResponse> listAccessedShareLinks() {
        fileStorageService.ensureShareLinksEnabled();
        User user = fileStorageService.requireAuthenticatedUser();
        return fileStorageService.listAccessedShareLinkResponses(user);
    }

    @GET
    @jakarta.ws.rs.Path("/files/{fileId}/shares/links/{token}/accesses")
    @Produces(MediaType.APPLICATION_JSON)
    public List<ShareLinkAccessResponse> listShareAccesses(
            @jakarta.ws.rs.PathParam("fileId") Long fileId,
            @jakarta.ws.rs.PathParam("token") String token) {
        fileStorageService.ensureShareLinksEnabled();
        User owner = fileStorageService.requireAuthenticatedUser();
        StoredFile file = fileStorageService.getOwnedFile(owner, fileId);
        return fileStorageService.listShareAccessResponses(owner, file, token);
    }

    private Response buildFileResponse(StoredFile file, boolean inline) {
        final stirling.software.common.model.io.Resource resource =
                fileStorageService.loadFile(file);
        String contentType =
                file.getContentType() == null
                        ? MediaType.APPLICATION_OCTET_STREAM
                        : file.getContentType();
        MediaType mediaType;
        try {
            mediaType = MediaType.valueOf(contentType);
        } catch (IllegalArgumentException ex) {
            mediaType = MediaType.APPLICATION_OCTET_STREAM_TYPE;
        }
        String disposition =
                (inline ? "inline" : "attachment")
                        + "; filename=\""
                        + file.getOriginalFilename()
                        + "\"";
        StreamingOutput stream =
                output -> {
                    try (InputStream in = resource.getInputStream()) {
                        in.transferTo(output);
                    }
                };
        return Response.ok(stream, mediaType)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                .header(HttpHeaders.CONTENT_LENGTH, file.getSizeBytes())
                .build();
    }

    private boolean isAuthenticated() {
        // TODO: Migration required - Spring's Authentication-based anonymous check is replaced by
        // SecurityIdentity. Verify "anonymous" semantics match once the security layer is migrated.
        return securityIdentity != null && !securityIdentity.isAnonymous();
    }

    private Optional<Response> tryRedirectToSignedUrl(StoredFile file, boolean inline) {
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
            Response response =
                    Response.status(Response.Status.FOUND).location(signed.get()).build();
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
