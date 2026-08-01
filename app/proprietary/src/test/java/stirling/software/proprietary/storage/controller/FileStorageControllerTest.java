package stirling.software.proprietary.storage.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.URI;
import java.time.Duration;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.StoredFile;
import stirling.software.proprietary.storage.provider.StorageProvider;
import stirling.software.proprietary.storage.service.FileStorageService;

@ExtendWith(MockitoExtension.class)
class FileStorageControllerTest {

    private static final String SIGNED_URL =
            "https://test-bucket.s3.example.com/signed-blob?X-Amz-Signature=abc";

    @Mock private FileStorageService fileStorageService;
    @Mock private StorageProvider storageProvider;

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        FileStorageController controller =
                new FileStorageController(fileStorageService, storageProvider);
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
