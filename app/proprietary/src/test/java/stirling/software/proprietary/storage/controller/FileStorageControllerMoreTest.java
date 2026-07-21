package stirling.software.proprietary.storage.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.ShareAccessRole;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.model.api.CreateShareLinkRequest;
import stirling.software.proprietary.storage.model.api.ShareLinkMetadataResponse;
import stirling.software.proprietary.storage.model.api.ShareLinkResponse;
import stirling.software.proprietary.storage.model.api.ShareWithUserRequest;
import stirling.software.proprietary.storage.model.api.StoredFileResponse;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.service.FileStorageService;

// Drives controller handlers directly (no MockMvc) to cover the non-download endpoints.
@ExtendWith(MockitoExtension.class)
class FileStorageControllerMoreTest {

    @Mock private FileStorageService fileStorageService;
    @Mock private StorageProvider storageProvider;

    private FileStorageController controller;

    @BeforeEach
    void setUp() {
        controller = new FileStorageController(fileStorageService, storageProvider);
    }

    private User user() {
        User u = new User();
        u.setId(11L);
        u.setUsername("alice");
        return u;
    }

    private StoredFile storedFile() {
        StoredFile f = new StoredFile();
        f.setId(77L);
        f.setOwner(user());
        f.setOriginalFilename("doc.pdf");
        f.setContentType("application/pdf");
        f.setSizeBytes(123L);
        f.setStorageKey("11/abc-doc.pdf");
        return f;
    }

    private Authentication auth(User u) {
        return new UsernamePasswordAuthenticationToken(u, "n/a", List.of());
    }

    // -------------------------------------------------------------------------
    // uploadFile / updateFile / list / getFileMetadata
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("CRUD delegation")
    class Crud {

        @Test
        void uploadFile_delegatesToService() {
            User u = user();
            MultipartFile file = mock(MultipartFile.class);
            StoredFileResponse resp = StoredFileResponse.builder().id(1L).build();
            when(fileStorageService.requireAuthenticatedUser()).thenReturn(u);
            when(fileStorageService.storeFileResponse(u, file, null, null)).thenReturn(resp);

            assertThat(controller.uploadFile(file, null, null)).isSameAs(resp);
        }

        @Test
        void updateFile_delegatesToService() {
            User u = user();
            MultipartFile file = mock(MultipartFile.class);
            StoredFileResponse resp = StoredFileResponse.builder().id(2L).build();
            when(fileStorageService.requireAuthenticatedUser()).thenReturn(u);
            when(fileStorageService.updateFileResponse(u, 5L, file, null, null)).thenReturn(resp);

            assertThat(controller.updateFile(5L, file, null, null)).isSameAs(resp);
        }

        @Test
        void listFiles_delegatesToService() {
            User u = user();
            StoredFileResponse resp = StoredFileResponse.builder().id(3L).build();
            when(fileStorageService.requireAuthenticatedUser()).thenReturn(u);
            when(fileStorageService.listAccessibleFileResponses(u)).thenReturn(List.of(resp));

            assertThat(controller.listFiles()).containsExactly(resp);
        }

        @Test
        void getFileMetadata_delegatesToService() {
            User u = user();
            StoredFileResponse resp = StoredFileResponse.builder().id(77L).build();
            when(fileStorageService.requireAuthenticatedUser()).thenReturn(u);
            when(fileStorageService.getAccessibleFileResponse(u, 77L)).thenReturn(resp);

            assertThat(controller.getFileMetadata(77L)).isSameAs(resp);
        }
    }

    // -------------------------------------------------------------------------
    // downloadFile streaming fallback (signed URL absent)
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("downloadFile streams when no signed URL is available")
    void downloadFile_noSignedUrl_streamsContent() throws Exception {
        User u = user();
        StoredFile f = storedFile();
        Resource resource = new ByteArrayResource(new byte[] {1, 2, 3});
        when(fileStorageService.requireAuthenticatedUser()).thenReturn(u);
        when(fileStorageService.getAccessibleFile(u, 77L)).thenReturn(f);
        when(storageProvider.signedDownloadUrl(
                        eq("11/abc-doc.pdf"), any(Duration.class), anyBoolean(), anyString()))
                .thenReturn(Optional.empty());
        when(fileStorageService.loadFile(f)).thenReturn(resource);

        ResponseEntity<Resource> response = controller.downloadFile(77L, false);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isSameAs(resource);
        verify(fileStorageService).requireReadAccess(u, f);
    }

    // -------------------------------------------------------------------------
    // deleteFile
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("deleteFile returns 204 and invokes service delete")
    void deleteFile_returnsNoContent() {
        User u = user();
        StoredFile f = storedFile();
        when(fileStorageService.requireAuthenticatedUser()).thenReturn(u);
        when(fileStorageService.getOwnedFile(u, 77L)).thenReturn(f);

        ResponseEntity<Void> response = controller.deleteFile(77L);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(fileStorageService).deleteFile(u, f);
    }

    // -------------------------------------------------------------------------
    // shareWithUser
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("shareWithUser")
    class ShareWithUserHandler {

        @Test
        void nullRequest_throwsBadRequest() {
            when(fileStorageService.requireAuthenticatedUser()).thenReturn(user());

            assertThatThrownBy(() -> controller.shareWithUser(77L, null))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(400);
        }

        @Test
        void blankUsername_throwsBadRequest() {
            when(fileStorageService.requireAuthenticatedUser()).thenReturn(user());
            ShareWithUserRequest req = new ShareWithUserRequest();
            req.setUsername("  ");

            assertThatThrownBy(() -> controller.shareWithUser(77L, req))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(400);
        }

        @Test
        void validRequest_delegatesToService() {
            User u = user();
            ShareWithUserRequest req = new ShareWithUserRequest();
            req.setUsername("bob");
            req.setAccessRole("viewer");
            StoredFileResponse resp = StoredFileResponse.builder().id(77L).build();
            when(fileStorageService.requireAuthenticatedUser()).thenReturn(u);
            when(fileStorageService.normalizeShareRole("viewer"))
                    .thenReturn(ShareAccessRole.VIEWER);
            when(fileStorageService.shareWithUserResponse(u, 77L, "bob", ShareAccessRole.VIEWER))
                    .thenReturn(resp);

            assertThat(controller.shareWithUser(77L, req)).isSameAs(resp);
        }
    }

    // -------------------------------------------------------------------------
    // revokeUserShare / leaveUserShare
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("revokeUserShare returns 204")
    void revokeUserShare_returnsNoContent() {
        User u = user();
        StoredFile f = storedFile();
        when(fileStorageService.requireAuthenticatedUser()).thenReturn(u);
        when(fileStorageService.getOwnedFile(u, 77L)).thenReturn(f);

        ResponseEntity<Void> response = controller.revokeUserShare(77L, "bob");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(fileStorageService).revokeUserShare(u, f, "bob");
    }

    @Test
    @DisplayName("leaveUserShare returns 204")
    void leaveUserShare_returnsNoContent() {
        User u = user();
        StoredFile f = storedFile();
        when(fileStorageService.requireAuthenticatedUser()).thenReturn(u);
        when(fileStorageService.getAccessibleFile(u, 77L)).thenReturn(f);

        ResponseEntity<Void> response = controller.leaveUserShare(77L);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(fileStorageService).leaveUserShare(u, f);
    }

    // -------------------------------------------------------------------------
    // createShareLink / revokeShareLink
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("createShareLink maps share to response DTO")
    void createShareLink_returnsTokenResponse() {
        User u = user();
        StoredFile f = storedFile();
        CreateShareLinkRequest req = new CreateShareLinkRequest();
        req.setAccessRole("viewer");
        FileShare share = new FileShare();
        share.setShareToken("tok-123");
        share.setAccessRole(ShareAccessRole.VIEWER);
        when(fileStorageService.requireAuthenticatedUser()).thenReturn(u);
        when(fileStorageService.getOwnedFile(u, 77L)).thenReturn(f);
        when(fileStorageService.normalizeShareRole("viewer")).thenReturn(ShareAccessRole.VIEWER);
        when(fileStorageService.createShareLink(u, f, ShareAccessRole.VIEWER)).thenReturn(share);

        ShareLinkResponse response = controller.createShareLink(77L, req);

        assertThat(response.getToken()).isEqualTo("tok-123");
        assertThat(response.getAccessRole()).isEqualTo("viewer");
    }

    @Test
    @DisplayName("revokeShareLink returns 204")
    void revokeShareLink_returnsNoContent() {
        User u = user();
        StoredFile f = storedFile();
        when(fileStorageService.requireAuthenticatedUser()).thenReturn(u);
        when(fileStorageService.getOwnedFile(u, 77L)).thenReturn(f);

        ResponseEntity<Void> response = controller.revokeShareLink(77L, "tok");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(fileStorageService).revokeShareLink(u, f, "tok");
    }

    // -------------------------------------------------------------------------
    // downloadShareLink
    // -------------------------------------------------------------------------

    @Nested
    @DisplayName("downloadShareLink")
    class DownloadShareLink {

        @Test
        void accessDenied_authenticated_throwsForbidden() {
            FileShare share = new FileShare();
            share.setFile(storedFile());
            Authentication authentication = auth(user());
            when(fileStorageService.getShareByToken("tok")).thenReturn(share);
            when(fileStorageService.canAccessShareLink(share, authentication)).thenReturn(false);

            assertThatThrownBy(() -> controller.downloadShareLink("tok", authentication, false))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(403);
        }

        @Test
        void accessDenied_anonymous_throwsUnauthorized() {
            FileShare share = new FileShare();
            share.setFile(storedFile());
            when(fileStorageService.getShareByToken("tok")).thenReturn(share);
            when(fileStorageService.canAccessShareLink(share, null)).thenReturn(false);

            assertThatThrownBy(() -> controller.downloadShareLink("tok", null, false))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                    .isEqualTo(401);
        }

        @Test
        void granted_streamsContent() throws Exception {
            StoredFile f = storedFile();
            FileShare share = new FileShare();
            share.setFile(f);
            Authentication authentication = auth(user());
            Resource resource = new ByteArrayResource(new byte[] {9});
            when(fileStorageService.getShareByToken("tok")).thenReturn(share);
            when(fileStorageService.canAccessShareLink(share, authentication)).thenReturn(true);
            when(storageProvider.signedDownloadUrl(
                            eq("11/abc-doc.pdf"), any(Duration.class), anyBoolean(), anyString()))
                    .thenReturn(Optional.empty());
            when(fileStorageService.loadFile(f)).thenReturn(resource);

            ResponseEntity<Resource> response =
                    controller.downloadShareLink("tok", authentication, false);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            verify(fileStorageService).recordShareAccess(share, authentication, false);
            verify(fileStorageService).requireReadAccess(share);
        }
    }

    // -------------------------------------------------------------------------
    // getShareLinkMetadata
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("getShareLinkMetadata returns metadata for owner")
    void getShareLinkMetadata_returnsMetadata() {
        User owner = user();
        StoredFile f = storedFile();
        FileShare share = new FileShare();
        share.setFile(f);
        share.setShareToken("tok");
        share.setAccessRole(ShareAccessRole.VIEWER);
        Authentication authentication = auth(owner);
        when(fileStorageService.getShareByToken("tok")).thenReturn(share);
        when(fileStorageService.canAccessShareLink(share, authentication)).thenReturn(true);
        when(fileStorageService.requireAuthenticatedUser()).thenReturn(owner);

        ShareLinkMetadataResponse response = controller.getShareLinkMetadata("tok", authentication);

        assertThat(response.getShareToken()).isEqualTo("tok");
        assertThat(response.getFileId()).isEqualTo(77L);
        assertThat(response.isOwnedByCurrentUser()).isTrue();
    }

    @Test
    @DisplayName("getShareLinkMetadata denied for anonymous throws 401")
    void getShareLinkMetadata_anonymousDenied_throwsUnauthorized() {
        FileShare share = new FileShare();
        share.setFile(storedFile());
        when(fileStorageService.getShareByToken("tok")).thenReturn(share);
        when(fileStorageService.canAccessShareLink(share, null)).thenReturn(false);

        assertThatThrownBy(() -> controller.getShareLinkMetadata("tok", null))
                .isInstanceOf(ResponseStatusException.class)
                .extracting(e -> ((ResponseStatusException) e).getStatusCode().value())
                .isEqualTo(401);
    }

    // -------------------------------------------------------------------------
    // listAccessedShareLinks / listShareAccesses
    // -------------------------------------------------------------------------

    @Test
    @DisplayName("listAccessedShareLinks delegates to service")
    void listAccessedShareLinks_delegates() {
        User u = user();
        ShareLinkMetadataResponse meta =
                ShareLinkMetadataResponse.builder().shareToken("t").build();
        when(fileStorageService.requireAuthenticatedUser()).thenReturn(u);
        when(fileStorageService.listAccessedShareLinkResponses(u)).thenReturn(List.of(meta));

        assertThat(controller.listAccessedShareLinks()).containsExactly(meta);
    }

    @Test
    @DisplayName("listShareAccesses delegates to service")
    void listShareAccesses_delegates() {
        User u = user();
        StoredFile f = storedFile();
        when(fileStorageService.requireAuthenticatedUser()).thenReturn(u);
        when(fileStorageService.getOwnedFile(u, 77L)).thenReturn(f);
        when(fileStorageService.listShareAccessResponses(u, f, "tok")).thenReturn(List.of());

        assertThat(controller.listShareAccesses(77L, "tok")).isEmpty();
        verify(fileStorageService).ensureShareLinksEnabled();
    }
}
