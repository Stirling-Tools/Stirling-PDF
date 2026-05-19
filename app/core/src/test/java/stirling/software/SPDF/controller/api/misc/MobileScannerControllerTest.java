package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.MobileScannerService;
import stirling.software.common.service.MobileScannerService.FileMetadata;
import stirling.software.common.service.MobileScannerService.SessionInfo;

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
