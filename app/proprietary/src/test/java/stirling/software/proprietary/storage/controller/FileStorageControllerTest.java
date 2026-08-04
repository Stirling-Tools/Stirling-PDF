package stirling.software.proprietary.storage.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.time.Duration;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.service.FileStorageService;

/**
 * Migration (Spring MockMvc -> direct JAX-RS calls): {@code FileStorageController.downloadFile} now
 * returns {@code jakarta.ws.rs.core.Response}. When the storage provider yields a signed URL the
 * controller replies with a 302 ({@code Response.Status.FOUND}) carrying only a {@code Location}
 * header. The collaborators are injected fields (no constructor), so the two used mocks are
 * assigned directly. The regression fence (no session credentials forwarded on the redirect) is
 * preserved by asserting the redirect Response carries no Authorization/Cookie/Set-Cookie headers.
 */
@ExtendWith(MockitoExtension.class)
class FileStorageControllerTest {

    private static final int FOUND = Response.Status.FOUND.getStatusCode();
    private static final String SIGNED_URL =
            "https://test-bucket.s3.example.com/signed-blob?X-Amz-Signature=abc";

    @Mock private FileStorageService fileStorageService;
    @Mock private StorageProvider storageProvider;

    private FileStorageController controller;

    @BeforeEach
    void setUp() {
        controller = new FileStorageController();
        // @Inject fields are not populated without a CDI container; wire the mocks the download
        // path uses directly (folderService / securityIdentity are not exercised here).
        controller.fileStorageService = fileStorageService;
        controller.storageProvider = storageProvider;
    }

    @Test
    void downloadFile_whenProviderReturnsSignedUrl_returns302RedirectWithoutSessionCredentials()
            throws Exception {
        StoredFile file = newStoredFile();

        when(fileStorageService.requireAuthenticatedUser()).thenReturn(file.getOwner());
        when(fileStorageService.getAccessibleFile(file.getOwner(), 77L)).thenReturn(file);
        when(storageProvider.signedDownloadUrl(
                        eq("11/abc-doc.pdf"), any(Duration.class), anyBoolean(), anyString()))
                .thenReturn(Optional.of(URI.create(SIGNED_URL)));

        Response response = controller.downloadFile(77L, false);

        assertThat(response.getStatus()).isEqualTo(FOUND);
        assertThat(response.getLocation()).isEqualTo(URI.create(SIGNED_URL));

        // Regression fence: signed URLs delegate auth to the URL itself, so the redirect
        // response must NOT carry any session credentials forward.
        assertThat(response.getHeaderString(HttpHeaders.AUTHORIZATION)).isNull();
        assertThat(response.getHeaderString("Cookie")).isNull();
        assertThat(response.getHeaderString("Set-Cookie")).isNull();
    }

    @Test
    void downloadFile_inlineFalse_forwardsAttachmentDispositionToSignedUrl() throws Exception {
        StoredFile file = newStoredFile();

        when(fileStorageService.requireAuthenticatedUser()).thenReturn(file.getOwner());
        when(fileStorageService.getAccessibleFile(file.getOwner(), 77L)).thenReturn(file);
        when(storageProvider.signedDownloadUrl(
                        eq("11/abc-doc.pdf"), any(Duration.class), eq(false), eq("doc.pdf")))
                .thenReturn(Optional.of(URI.create(SIGNED_URL)));

        Response response = controller.downloadFile(77L, false);

        assertThat(response.getStatus()).isEqualTo(FOUND);
        assertThat(response.getLocation()).isEqualTo(URI.create(SIGNED_URL));

        verify(storageProvider)
                .signedDownloadUrl(
                        eq("11/abc-doc.pdf"), any(Duration.class), eq(false), eq("doc.pdf"));
    }

    @Test
    void downloadFile_inlineTrue_forwardsInlineDispositionToSignedUrl() throws Exception {
        StoredFile file = newStoredFile();

        when(fileStorageService.requireAuthenticatedUser()).thenReturn(file.getOwner());
        when(fileStorageService.getAccessibleFile(file.getOwner(), 77L)).thenReturn(file);
        when(storageProvider.signedDownloadUrl(
                        eq("11/abc-doc.pdf"), any(Duration.class), eq(true), eq("doc.pdf")))
                .thenReturn(Optional.of(URI.create(SIGNED_URL)));

        Response response = controller.downloadFile(77L, true);

        assertThat(response.getStatus()).isEqualTo(FOUND);
        assertThat(response.getLocation()).isEqualTo(URI.create(SIGNED_URL));

        verify(storageProvider)
                .signedDownloadUrl(
                        eq("11/abc-doc.pdf"), any(Duration.class), eq(true), eq("doc.pdf"));
    }

    private static StoredFile newStoredFile() {
        User user = new User();
        user.setId(11L);
        user.setUsername("alice");

        StoredFile file = new StoredFile();
        file.setId(77L);
        file.setOwner(user);
        file.setOriginalFilename("doc.pdf");
        file.setContentType("application/pdf");
        file.setSizeBytes(123L);
        file.setStorageKey("11/abc-doc.pdf");
        return file;
    }
}
