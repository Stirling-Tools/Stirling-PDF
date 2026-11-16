package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.MobileScannerService;
import stirling.software.common.service.MobileScannerService.FileMetadata;
import stirling.software.common.service.MobileScannerService.SessionInfo;
import stirling.software.common.service.MobileScannerService.UploadLimitException;

@ExtendWith(MockitoExtension.class)
class MobileScannerControllerTest {

    @Mock private MobileScannerService mobileScannerService;
    @Mock private ApplicationProperties applicationProperties;
    @Mock private ApplicationProperties.System systemProps;

    private MobileScannerController controller;

    @BeforeEach
    void setUp() {
        controller = new MobileScannerController(mobileScannerService, applicationProperties);
    }

    private void enableMobileScanner() {
        when(applicationProperties.getSystem()).thenReturn(systemProps);
        when(systemProps.isEnableMobileScanner()).thenReturn(true);
    }

    private void disableMobileScanner() {
        when(applicationProperties.getSystem()).thenReturn(systemProps);
        when(systemProps.isEnableMobileScanner()).thenReturn(false);
    }

    // --- shared-endpoint gating: scanner and mobile signature share this API ---

    @Test
    void createSession_whenOnlyMobileSignatureEnabled_returnsOk() {
        // The signature feature must work with the scanner switched off.
        when(applicationProperties.getSystem()).thenReturn(systemProps);
        when(systemProps.isEnableMobileScanner()).thenReturn(false);
        when(systemProps.isEnableMobileSignature()).thenReturn(true);
        SessionInfo sessionInfo = new SessionInfo("test-session", 1000L, 601000L, 600000L);
        when(mobileScannerService.createSession("test-session")).thenReturn(sessionInfo);

        ResponseEntity<Map<String, Object>> response = controller.createSession("test-session");

        assertEquals(HttpStatus.OK, response.getStatusCode());
    }

    @Test
    void createSession_whenBothFeaturesDisabled_returnsForbidden() {
        when(applicationProperties.getSystem()).thenReturn(systemProps);
        when(systemProps.isEnableMobileScanner()).thenReturn(false);
        when(systemProps.isEnableMobileSignature()).thenReturn(false);

        ResponseEntity<Map<String, Object>> response = controller.createSession("test-session");

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    // --- createSession tests ---

    @Test
    void createSession_whenEnabled_returnsOk() {
        enableMobileScanner();
        SessionInfo sessionInfo = new SessionInfo("test-session", 1000L, 601000L, 600000L);
        when(mobileScannerService.createSession("test-session")).thenReturn(sessionInfo);

        ResponseEntity<Map<String, Object>> response = controller.createSession("test-session");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(true, response.getBody().get("success"));
        assertEquals("test-session", response.getBody().get("sessionId"));
    }

    @Test
    void createSession_whenDisabled_returnsForbidden() {
        disableMobileScanner();

        ResponseEntity<Map<String, Object>> response = controller.createSession("test-session");

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    @Test
    void createSession_withInvalidId_returnsBadRequest() {
        enableMobileScanner();
        when(mobileScannerService.createSession("bad!id"))
                .thenThrow(new IllegalArgumentException("Invalid session ID"));

        ResponseEntity<Map<String, Object>> response = controller.createSession("bad!id");

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    // --- validateSession tests ---

    @Test
    void validateSession_whenValid_returnsOk() {
        enableMobileScanner();
        SessionInfo sessionInfo = new SessionInfo("test-session", 1000L, 601000L, 600000L);
        when(mobileScannerService.validateSession("test-session")).thenReturn(sessionInfo);

        ResponseEntity<Map<String, Object>> response = controller.validateSession("test-session");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(true, response.getBody().get("valid"));
    }

    @Test
    void validateSession_whenNotFound_returns404() {
        enableMobileScanner();
        when(mobileScannerService.validateSession("nonexistent")).thenReturn(null);

        ResponseEntity<Map<String, Object>> response = controller.validateSession("nonexistent");

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        assertEquals(false, response.getBody().get("valid"));
    }

    @Test
    void validateSession_whenDisabled_returnsForbidden() {
        disableMobileScanner();

        ResponseEntity<Map<String, Object>> response = controller.validateSession("test-session");

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }

    // --- uploadFiles tests ---

    @Test
    void uploadFiles_withFiles_returnsOk() throws Exception {
        enableMobileScanner();
        List<MultipartFile> files =
                List.of(
                        new MockMultipartFile(
                                "files", "scan.jpg", "image/jpeg", new byte[] {1, 2, 3}));

        ResponseEntity<Map<String, Object>> response =
                controller.uploadFiles("test-session", files);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(true, response.getBody().get("success"));
        assertEquals(1, response.getBody().get("filesUploaded"));
    }

    @Test
    void uploadFiles_withNullFiles_returnsBadRequest() {
        enableMobileScanner();

        ResponseEntity<Map<String, Object>> response = controller.uploadFiles("test-session", null);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void uploadFiles_withEmptyFiles_returnsBadRequest() {
        enableMobileScanner();

        ResponseEntity<Map<String, Object>> response =
                controller.uploadFiles("test-session", Collections.emptyList());

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void uploadFiles_whenIOException_returns500() throws Exception {
        enableMobileScanner();
        List<MultipartFile> files =
                List.of(
                        new MockMultipartFile(
                                "files", "scan.jpg", "image/jpeg", new byte[] {1, 2, 3}));
        doThrow(new IOException("Disk full"))
                .when(mobileScannerService)
                .uploadFiles(eq("test-session"), any());

        ResponseEntity<Map<String, Object>> response =
                controller.uploadFiles("test-session", files);

        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode());
    }

    @Test
    void uploadFiles_whenFileTooLarge_returns413() throws Exception {
        enableMobileScanner();
        doThrow(new UploadLimitException("too big", false))
                .when(mobileScannerService)
                .uploadFiles(eq("test-session"), any());

        ResponseEntity<Map<String, Object>> response =
                controller.uploadFiles("test-session", List.of(scan()));

        assertEquals(HttpStatus.CONTENT_TOO_LARGE, response.getStatusCode());
    }

    @Test
    void uploadFiles_whenServerFull_returns503() throws Exception {
        enableMobileScanner();
        doThrow(new UploadLimitException("full", true))
                .when(mobileScannerService)
                .uploadFiles(eq("test-session"), any());

        ResponseEntity<Map<String, Object>> response =
                controller.uploadFiles("test-session", List.of(scan()));

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, response.getStatusCode());
    }

    @Test
    void createSession_whenSessionCapReached_returns503() {
        enableMobileScanner();
        when(mobileScannerService.createSession("test-session"))
                .thenThrow(new UploadLimitException("too many", true));

        ResponseEntity<Map<String, Object>> response = controller.createSession("test-session");

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, response.getStatusCode());
    }

    // --- downloadFile tests ---

    @Test
    void downloadFile_streamsFileAndDeletesItOnlyAfterStreamCloses(@TempDir Path dir)
            throws Exception {
        enableMobileScanner();
        Path file = Files.write(dir.resolve("scan.jpg"), new byte[] {1, 2, 3});
        when(mobileScannerService.getFile("test-session", "scan.jpg")).thenReturn(file);

        ResponseEntity<Resource> response = controller.downloadFile("test-session", "scan.jpg");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(3L, response.getBody().contentLength());
        verify(mobileScannerService, never()).deleteFileAfterDownload(any(), any());
        try (InputStream in = response.getBody().getInputStream()) {
            assertArrayEquals(new byte[] {1, 2, 3}, in.readAllBytes());
            verify(mobileScannerService, never()).deleteFileAfterDownload(any(), any());
            in.close();
        }
        verify(mobileScannerService, times(1)).deleteFileAfterDownload("test-session", "scan.jpg");
    }

    @Test
    void downloadFile_partialReadReleasesClaimInsteadOfDeleting(@TempDir Path dir)
            throws Exception {
        enableMobileScanner();
        Path file = Files.write(dir.resolve("scan.jpg"), new byte[] {1, 2, 3});
        when(mobileScannerService.getFile("test-session", "scan.jpg")).thenReturn(file);

        ResponseEntity<Resource> response = controller.downloadFile("test-session", "scan.jpg");
        try (InputStream in = response.getBody().getInputStream()) {
            in.read();
        }

        verify(mobileScannerService).releaseDownloadClaim("test-session", "scan.jpg");
        verify(mobileScannerService, never()).deleteFileAfterDownload(any(), any());
    }

    @Test
    void downloadFile_transferToCountsAsFullRead(@TempDir Path dir) throws Exception {
        enableMobileScanner();
        Path file = Files.write(dir.resolve("scan.jpg"), new byte[] {1, 2, 3});
        when(mobileScannerService.getFile("test-session", "scan.jpg")).thenReturn(file);

        ResponseEntity<Resource> response = controller.downloadFile("test-session", "scan.jpg");
        try (InputStream in = response.getBody().getInputStream()) {
            in.transferTo(java.io.OutputStream.nullOutputStream());
        }

        verify(mobileScannerService).deleteFileAfterDownload("test-session", "scan.jpg");
        verify(mobileScannerService, never()).releaseDownloadClaim(any(), any());
    }

    @Test
    void downloadFile_contentTypeComesFromFilename(@TempDir Path dir) throws Exception {
        enableMobileScanner();
        Path jpg = Files.write(dir.resolve("scan.jpg"), new byte[] {1});
        Path unknown = Files.write(dir.resolve("scan.zzz"), new byte[] {1});
        when(mobileScannerService.getFile("test-session", "scan.jpg")).thenReturn(jpg);
        when(mobileScannerService.getFile("test-session", "scan.zzz")).thenReturn(unknown);

        assertEquals(
                MediaType.IMAGE_JPEG,
                controller.downloadFile("test-session", "scan.jpg").getHeaders().getContentType());
        assertEquals(
                MediaType.APPLICATION_OCTET_STREAM,
                controller.downloadFile("test-session", "scan.zzz").getHeaders().getContentType());
    }

    @Test
    void downloadFile_whenMissing_returns404() throws Exception {
        enableMobileScanner();
        when(mobileScannerService.getFile("test-session", "gone.jpg"))
                .thenThrow(new IOException("File not found"));

        ResponseEntity<Resource> response = controller.downloadFile("test-session", "gone.jpg");

        assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
        verify(mobileScannerService, never()).deleteFileAfterDownload(any(), any());
    }

    private static MultipartFile scan() {
        return new MockMultipartFile("files", "scan.jpg", "image/jpeg", new byte[] {1, 2, 3});
    }

    // --- getSessionFiles tests ---

    @Test
    void getSessionFiles_returnsFileList() {
        enableMobileScanner();
        List<FileMetadata> files = List.of(new FileMetadata("scan.jpg", 1234L, "image/jpeg"));
        when(mobileScannerService.getSessionFiles("test-session")).thenReturn(files);

        ResponseEntity<Map<String, Object>> response = controller.getSessionFiles("test-session");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(1, response.getBody().get("count"));
    }

    // --- deleteSession tests ---

    @Test
    void deleteSession_whenEnabled_returnsOk() {
        enableMobileScanner();

        ResponseEntity<Map<String, Object>> response = controller.deleteSession("test-session");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(mobileScannerService).deleteSession("test-session");
    }

    @Test
    void deleteSession_whenDisabled_returnsForbidden() {
        disableMobileScanner();

        ResponseEntity<Map<String, Object>> response = controller.deleteSession("test-session");

        assertEquals(HttpStatus.FORBIDDEN, response.getStatusCode());
    }
}
