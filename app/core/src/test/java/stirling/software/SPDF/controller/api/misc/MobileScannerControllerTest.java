package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.MobileScannerService;
import stirling.software.common.service.MobileScannerService.FileMetadata;
import stirling.software.common.service.MobileScannerService.SessionInfo;

@ExtendWith(MockitoExtension.class)
class MobileScannerControllerTest {

    private static final int OK = Response.Status.OK.getStatusCode();
    private static final int FORBIDDEN = Response.Status.FORBIDDEN.getStatusCode();
    private static final int NOT_FOUND = Response.Status.NOT_FOUND.getStatusCode();
    private static final int BAD_REQUEST = Response.Status.BAD_REQUEST.getStatusCode();
    private static final int INTERNAL_SERVER_ERROR =
            Response.Status.INTERNAL_SERVER_ERROR.getStatusCode();

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

    @SuppressWarnings("unchecked")
    private static Map<String, Object> body(Response response) {
        return (Map<String, Object>) response.getEntity();
    }

    /**
     * Build a RESTEasy Reactive {@link FileUpload} stub. The controller maps each upload via {@code
     * FileUploadMultipartFile.of(List)}, which only inspects {@code fileName()} to pick the file
     * part, so that is all that needs stubbing for these tests.
     */
    private static FileUpload upload(String fileName) {
        FileUpload upload = mock(FileUpload.class);
        // lenient: some paths (e.g. the IOException case) reject before fileName() is read.
        lenient().when(upload.fileName()).thenReturn(fileName);
        return upload;
    }

    // --- createSession tests ---

    @Test
    void createSession_whenEnabled_returnsOk() {
        enableMobileScanner();
        SessionInfo sessionInfo = new SessionInfo("test-session", 1000L, 601000L, 600000L);
        when(mobileScannerService.createSession("test-session")).thenReturn(sessionInfo);

        Response response = controller.createSession("test-session");

        assertEquals(OK, response.getStatus());
        assertEquals(true, body(response).get("success"));
        assertEquals("test-session", body(response).get("sessionId"));
    }

    @Test
    void createSession_whenDisabled_returnsForbidden() {
        disableMobileScanner();

        Response response = controller.createSession("test-session");

        assertEquals(FORBIDDEN, response.getStatus());
    }

    @Test
    void createSession_withInvalidId_returnsBadRequest() {
        enableMobileScanner();
        when(mobileScannerService.createSession("bad!id"))
                .thenThrow(new IllegalArgumentException("Invalid session ID"));

        Response response = controller.createSession("bad!id");

        assertEquals(BAD_REQUEST, response.getStatus());
    }

    // --- validateSession tests ---

    @Test
    void validateSession_whenValid_returnsOk() {
        enableMobileScanner();
        SessionInfo sessionInfo = new SessionInfo("test-session", 1000L, 601000L, 600000L);
        when(mobileScannerService.validateSession("test-session")).thenReturn(sessionInfo);

        Response response = controller.validateSession("test-session");

        assertEquals(OK, response.getStatus());
        assertEquals(true, body(response).get("valid"));
    }

    @Test
    void validateSession_whenNotFound_returns404() {
        enableMobileScanner();
        when(mobileScannerService.validateSession("nonexistent")).thenReturn(null);

        Response response = controller.validateSession("nonexistent");

        assertEquals(NOT_FOUND, response.getStatus());
        assertEquals(false, body(response).get("valid"));
    }

    @Test
    void validateSession_whenDisabled_returnsForbidden() {
        disableMobileScanner();

        Response response = controller.validateSession("test-session");

        assertEquals(FORBIDDEN, response.getStatus());
    }

    // --- uploadFiles tests ---

    @Test
    void uploadFiles_withFiles_returnsOk() throws Exception {
        enableMobileScanner();
        List<FileUpload> files = List.of(upload("scan.jpg"));

        Response response = controller.uploadFiles("test-session", files);

        assertEquals(OK, response.getStatus());
        assertEquals(true, body(response).get("success"));
        assertEquals(1, body(response).get("filesUploaded"));
    }

    @Test
    void uploadFiles_withNullFiles_returnsBadRequest() {
        enableMobileScanner();

        Response response = controller.uploadFiles("test-session", null);

        assertEquals(BAD_REQUEST, response.getStatus());
    }

    @Test
    void uploadFiles_withEmptyFiles_returnsBadRequest() {
        enableMobileScanner();

        Response response = controller.uploadFiles("test-session", Collections.emptyList());

        assertEquals(BAD_REQUEST, response.getStatus());
    }

    @Test
    void uploadFiles_whenIOException_returns500() throws Exception {
        enableMobileScanner();
        List<FileUpload> files = List.of(upload("scan.jpg"));
        doThrow(new IOException("Disk full"))
                .when(mobileScannerService)
                .uploadFiles(eq("test-session"), any());

        Response response = controller.uploadFiles("test-session", files);

        assertEquals(INTERNAL_SERVER_ERROR, response.getStatus());
    }

    // --- getSessionFiles tests ---

    @Test
    void getSessionFiles_returnsFileList() {
        enableMobileScanner();
        List<FileMetadata> files = List.of(new FileMetadata("scan.jpg", 1234L, "image/jpeg"));
        when(mobileScannerService.getSessionFiles("test-session")).thenReturn(files);

        Response response = controller.getSessionFiles("test-session");

        assertEquals(OK, response.getStatus());
        assertEquals(1, body(response).get("count"));
    }

    // --- deleteSession tests ---

    @Test
    void deleteSession_whenEnabled_returnsOk() {
        enableMobileScanner();

        Response response = controller.deleteSession("test-session");

        assertEquals(OK, response.getStatus());
        verify(mobileScannerService).deleteSession("test-session");
    }

    @Test
    void deleteSession_whenDisabled_returnsForbidden() {
        disableMobileScanner();

        Response response = controller.deleteSession("test-session");

        assertEquals(FORBIDDEN, response.getStatus());
    }
}
