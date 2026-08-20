package stirling.software.proprietary.storage.controller;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;

import stirling.software.common.model.io.ByteArrayResource;
import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.service.AuditService;
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

    private static final int OK = Response.Status.OK.getStatusCode();
    private static final String SIGNED_URL =
            "https://test-bucket.s3.example.com/signed-blob?X-Amz-Signature=abc";

    @Mock private FileStorageService fileStorageService;
    @Mock private StorageProvider storageProvider;
    @Mock private AuditService auditService;

    private FileStorageController controller;

    @BeforeEach
    void setUp() {
        controller = new FileStorageController();
        // @Inject fields are not populated without a CDI container; wire the mocks the download
        // path uses directly (folderService / securityIdentity are not exercised here).
        controller.fileStorageService = fileStorageService;
        controller.storageProvider = storageProvider;
        controller.auditService = auditService;
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

    @Test
    void downloadFile_encryptedContent_auditsPlaintextExportAsAttachment() throws Exception {
        StoredFile file = newStoredFile();
        file.setEncryptionKeyId("cafe1234-0000-0000-0000-000000000001");
        streamedDownload(file);

        assertThat(controller.downloadFile(77L, false).getStatus()).isEqualTo(OK);

        // The marker is the compliance evidence that a decrypted copy left the platform, so it
        // must carry the key it came from and whether it was viewed in-app or saved.
        assertThat(exportEvents())
                .singleElement()
                .satisfies(
                        event -> {
                            assertThat(event).containsEntry("action", "plaintextExport");
                            assertThat(event).containsEntry("fileId", 77L);
                            assertThat(event).containsEntry("inline", false);
                            assertThat(event)
                                    .containsEntry("keyId", "cafe1234-0000-0000-0000-000000000001");
                        });
    }

    @Test
    void downloadFile_inlineView_marksTheExportInline() throws Exception {
        StoredFile file = newStoredFile();
        file.setEncryptionKeyId("cafe1234-0000-0000-0000-000000000001");
        streamedDownload(file);

        assertThat(controller.downloadFile(77L, true).getStatus()).isEqualTo(OK);

        // An in-app view and a saved copy are both exports, but a reviewer needs to tell them
        // apart.
        assertThat(exportEvents())
                .singleElement()
                .satisfies(e -> assertThat(e).containsEntry("inline", true));
    }

    @Test
    void downloadFile_plaintextContent_recordsNoExportEvent() throws Exception {
        StoredFile file = newStoredFile(); // encryptionKeyId stays null
        streamedDownload(file);

        assertThat(controller.downloadFile(77L, false).getStatus()).isEqualTo(OK);

        // Nothing was encrypted at rest, so there is no decryption to attest to.
        verifyNoInteractions(auditService);
    }

    /** Stubs an app-streamed (non-presigned) download of {@code file}. */
    private void streamedDownload(StoredFile file) throws Exception {
        when(fileStorageService.requireAuthenticatedUser()).thenReturn(file.getOwner());
        when(fileStorageService.getAccessibleFile(file.getOwner(), 77L)).thenReturn(file);
        when(storageProvider.signedDownloadUrl(
                        anyString(), any(Duration.class), anyBoolean(), anyString()))
                .thenReturn(Optional.empty());
        when(fileStorageService.loadFile(file))
                .thenReturn(new ByteArrayResource("decrypted bytes".getBytes(UTF_8)));
    }

    private List<Map<String, Object>> exportEvents() {
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> data = ArgumentCaptor.forClass(Map.class);
        verify(auditService).audit(eq(AuditEventType.STORAGE_ENCRYPTION), data.capture());
        return data.getAllValues();
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
