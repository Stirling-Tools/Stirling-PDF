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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.proprietary.audit.AuditEventType;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.service.AuditService;
import stirling.software.proprietary.storage.model.FileShare;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.service.FileStorageService;

@ExtendWith(MockitoExtension.class)
class FileStorageControllerTest {

    private static final String SIGNED_URL =
            "https://test-bucket.s3.example.com/signed-blob?X-Amz-Signature=abc";

    @Mock private FileStorageService fileStorageService;
    @Mock private StorageProvider storageProvider;
    @Mock private AuditService auditService;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        FileStorageController controller =
                new FileStorageController(fileStorageService, storageProvider, auditService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
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

        MvcResult result =
                mockMvc.perform(get("/api/v1/storage/files/{fileId}/download", 77L))
                        .andExpect(status().is(HttpStatus.FOUND.value()))
                        .andExpect(header().string(HttpHeaders.LOCATION, SIGNED_URL))
                        .andExpect(redirectedUrl(SIGNED_URL))
                        .andReturn();

        // Regression fence: signed URLs delegate auth to the URL itself, so the redirect
        // response must NOT carry any session credentials forward.
        assertThat(result.getResponse().getHeader(HttpHeaders.AUTHORIZATION)).isNull();
        assertThat(result.getResponse().getHeader(HttpHeaders.COOKIE)).isNull();
        assertThat(result.getResponse().getHeader(HttpHeaders.SET_COOKIE)).isNull();
    }

    @Test
    void downloadFile_inlineFalse_forwardsAttachmentDispositionToSignedUrl() throws Exception {
        StoredFile file = newStoredFile();

        when(fileStorageService.requireAuthenticatedUser()).thenReturn(file.getOwner());
        when(fileStorageService.getAccessibleFile(file.getOwner(), 77L)).thenReturn(file);
        when(storageProvider.signedDownloadUrl(
                        eq("11/abc-doc.pdf"), any(Duration.class), eq(false), eq("doc.pdf")))
                .thenReturn(Optional.of(URI.create(SIGNED_URL)));

        mockMvc.perform(get("/api/v1/storage/files/{fileId}/download", 77L))
                .andExpect(status().is(HttpStatus.FOUND.value()))
                .andExpect(header().string(HttpHeaders.LOCATION, SIGNED_URL));

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

        mockMvc.perform(get("/api/v1/storage/files/{fileId}/download", 77L).param("inline", "true"))
                .andExpect(status().is(HttpStatus.FOUND.value()))
                .andExpect(header().string(HttpHeaders.LOCATION, SIGNED_URL));

        verify(storageProvider)
                .signedDownloadUrl(
                        eq("11/abc-doc.pdf"), any(Duration.class), eq(true), eq("doc.pdf"));
    }

    @Test
    void downloadFile_encryptedContent_auditsPlaintextExportAsAttachment() throws Exception {
        StoredFile file = newStoredFile();
        file.setEncryptionKeyId("cafe1234-0000-0000-0000-000000000001");
        streamedDownload(file);

        mockMvc.perform(get("/api/v1/storage/files/{fileId}/download", 77L))
                .andExpect(status().isOk());

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

        mockMvc.perform(get("/api/v1/storage/files/{fileId}/download", 77L).param("inline", "true"))
                .andExpect(status().isOk());

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

        mockMvc.perform(get("/api/v1/storage/files/{fileId}/download", 77L))
                .andExpect(status().isOk());

        // Nothing was encrypted at rest, so there is no decryption to attest to.
        verifyNoInteractions(auditService);
    }

    @Test
    void downloadFile_inlineHtml_forcesAttachmentDisposition() throws Exception {
        StoredFile file = newStoredFile();
        file.setOriginalFilename("payload.html");
        file.setContentType("text/html");
        streamedDownload(file);

        // Uploader-controlled HTML served inline runs on our origin and steals the JWT.
        mockMvc.perform(get("/api/v1/storage/files/{fileId}/download", 77L).param("inline", "true"))
                .andExpect(status().isOk())
                .andExpect(
                        header().string(
                                        HttpHeaders.CONTENT_DISPOSITION,
                                        "attachment; filename=\"payload.html\""));
    }

    @Test
    void downloadFile_inlineSvg_forcesAttachmentDisposition() throws Exception {
        StoredFile file = newStoredFile();
        file.setOriginalFilename("payload.svg");
        file.setContentType("image/svg+xml");
        streamedDownload(file);

        // SVG carries script too, so it is not on the inline allowlist despite being an image.
        mockMvc.perform(get("/api/v1/storage/files/{fileId}/download", 77L).param("inline", "true"))
                .andExpect(status().isOk())
                .andExpect(
                        header().string(
                                        HttpHeaders.CONTENT_DISPOSITION,
                                        "attachment; filename=\"payload.svg\""));
    }

    @Test
    void downloadFile_inlineHtmlWithCharsetParameter_forcesAttachmentDisposition()
            throws Exception {
        StoredFile file = newStoredFile();
        file.setOriginalFilename("payload.html");
        file.setContentType("TEXT/HTML; charset=utf-8");
        streamedDownload(file);

        // Parameters and casing must not let a blocked type slip past the allowlist.
        mockMvc.perform(get("/api/v1/storage/files/{fileId}/download", 77L).param("inline", "true"))
                .andExpect(status().isOk())
                .andExpect(
                        header().string(
                                        HttpHeaders.CONTENT_DISPOSITION,
                                        "attachment; filename=\"payload.html\""));
    }

    @Test
    void downloadFile_inlinePdf_stillRendersInline() throws Exception {
        StoredFile file = newStoredFile();
        streamedDownload(file);

        // The allowlist must not break the in-app viewer for the types it was built for.
        mockMvc.perform(get("/api/v1/storage/files/{fileId}/download", 77L).param("inline", "true"))
                .andExpect(status().isOk())
                .andExpect(
                        header().string(
                                        HttpHeaders.CONTENT_DISPOSITION,
                                        "inline; filename=\"doc.pdf\""));
    }

    @Test
    void downloadFile_inlineTextPlainWithCharsetParameter_stillRendersInline() throws Exception {
        StoredFile file = newStoredFile();
        file.setOriginalFilename("notes.txt");
        file.setContentType("text/plain; charset=UTF-8");
        streamedDownload(file);

        mockMvc.perform(get("/api/v1/storage/files/{fileId}/download", 77L).param("inline", "true"))
                .andExpect(status().isOk())
                .andExpect(
                        header().string(
                                        HttpHeaders.CONTENT_DISPOSITION,
                                        "inline; filename=\"notes.txt\""));
    }

    @Test
    void downloadShareLink_inlineHtml_forcesAttachmentDisposition() throws Exception {
        StoredFile file = newStoredFile();
        file.setOriginalFilename("payload.html");
        file.setContentType("text/html");
        FileShare share = new FileShare();
        share.setFile(file);

        when(fileStorageService.getShareByToken("tok")).thenReturn(share);
        when(fileStorageService.canAccessShareLink(share, null)).thenReturn(true);
        when(storageProvider.signedDownloadUrl(
                        anyString(), any(Duration.class), anyBoolean(), anyString()))
                .thenReturn(Optional.empty());
        when(fileStorageService.loadFile(file))
                .thenReturn(new ByteArrayResource("<script>alert(1)</script>".getBytes(UTF_8)));

        // The share-link endpoint is the unauthenticated reach, so it needs the same guard.
        mockMvc.perform(get("/api/v1/storage/share-links/{token}", "tok").param("inline", "true"))
                .andExpect(status().isOk())
                .andExpect(
                        header().string(
                                        HttpHeaders.CONTENT_DISPOSITION,
                                        "attachment; filename=\"payload.html\""));
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
