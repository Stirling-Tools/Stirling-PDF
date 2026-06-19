package stirling.software.SPDF.exception;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.NoSuchFileException;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;

import stirling.software.common.util.ExceptionUtils.*;

/**
 * Unit tests for {@link GlobalExceptionHandler}, the JAX-RS {@link
 * jakarta.ws.rs.ext.ExceptionMapper} that produces RFC 7807 problem responses.
 *
 * <p>Migrated off Spring: the handler no longer takes a {@code MessageSource}/{@code Environment}
 * (it reads the shared {@code messages} ResourceBundle and {@code quarkus.profile} directly), each
 * handler method now takes a {@code String requestUri} instead of an {@code HttpServletRequest},
 * and every method returns {@code jakarta.ws.rs.core.Response} with an ordered {@code Map} body.
 * The Spring-MVC-specific handlers (missing parameter/part, max upload size, method-not-supported,
 * not-found, media-type-not-acceptable) were dropped in the production class - their Spring
 * exception types are no longer on the classpath - so the tests for them are removed here. A new
 * {@link #handleWebApplicationException_preserves_status} test covers the JAX-RS replacement for
 * Spring's {@code ResponseStatusException}.
 */
class GlobalExceptionHandlerTest {

    private static final String REQUEST_URI = "/api/test";

    private GlobalExceptionHandler handler;

    @BeforeEach
    void setUp() {
        // Ensure dev-mode detection (driven by quarkus.profile) is off by default so the
        // debug fields are not added. Individual dev-mode tests opt in and restore afterwards.
        System.clearProperty("quarkus.profile");
        handler = new GlobalExceptionHandler();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> body(Response resp) {
        return (Map<String, Object>) resp.getEntity();
    }

    // ---- PdfPasswordException ----

    @Test
    void handlePdfPassword_returns_400() {
        PdfPasswordException ex = new PdfPasswordException("bad password", null, "E001");
        Response resp = handler.handlePdfPassword(ex, REQUEST_URI);
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), resp.getStatus());
        assertEquals("E001", body(resp).get("errorCode"));
    }

    // ---- GhostscriptException ----

    @Test
    void handleGhostscriptException_returns_500() {
        GhostscriptException ex = new GhostscriptException("gs failed", null, "E010");
        Response resp = handler.handleGhostscriptException(ex, REQUEST_URI);
        assertEquals(Response.Status.INTERNAL_SERVER_ERROR.getStatusCode(), resp.getStatus());
        assertEquals("E010", body(resp).get("errorCode"));
    }

    // ---- FfmpegRequiredException ----

    @Test
    void handleFfmpegRequired_returns_503() {
        FfmpegRequiredException ex = new FfmpegRequiredException("no ffmpeg", "E020");
        Response resp = handler.handleFfmpegRequired(ex, REQUEST_URI);
        assertEquals(Response.Status.SERVICE_UNAVAILABLE.getStatusCode(), resp.getStatus());
    }

    // ---- PDF and DPI exceptions ----

    @Test
    void handlePdfCorrupted_returns_400() {
        PdfCorruptedException ex = new PdfCorruptedException("corrupt", null, "E002");
        Response resp = handler.handlePdfAndDpiExceptions(ex, REQUEST_URI);
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), resp.getStatus());
    }

    @Test
    void handlePdfEncryption_returns_400() {
        PdfEncryptionException ex = new PdfEncryptionException("encrypted", null, "E003");
        Response resp = handler.handlePdfAndDpiExceptions(ex, REQUEST_URI);
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), resp.getStatus());
    }

    @Test
    void handleOutOfMemoryDpi_returns_400() {
        OutOfMemoryDpiException ex = new OutOfMemoryDpiException("oom", null, "E004");
        Response resp = handler.handlePdfAndDpiExceptions(ex, REQUEST_URI);
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), resp.getStatus());
    }

    // ---- Format exceptions ----

    @Test
    void handleCbrFormat_returns_400() {
        CbrFormatException ex = new CbrFormatException("bad cbr", "E030");
        Response resp = handler.handleFormatExceptions(ex, REQUEST_URI);
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), resp.getStatus());
    }

    @Test
    void handleCbzFormat_returns_400() {
        CbzFormatException ex = new CbzFormatException("bad cbz", "E031");
        Response resp = handler.handleFormatExceptions(ex, REQUEST_URI);
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), resp.getStatus());
    }

    @Test
    void handleEmlFormat_returns_400() {
        EmlFormatException ex = new EmlFormatException("bad eml", "E033");
        Response resp = handler.handleFormatExceptions(ex, REQUEST_URI);
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), resp.getStatus());
    }

    // ---- BaseValidationException ----

    @Test
    void handleValidation_returns_400() {
        CbrFormatException ex = new CbrFormatException("validation fail", "E030");
        Response resp = handler.handleValidation(ex, REQUEST_URI);
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), resp.getStatus());
    }

    // ---- BaseAppException ----

    @Test
    void handleBaseApp_returns_500() {
        PdfCorruptedException ex = new PdfCorruptedException("app error", null, "E099");
        Response resp = handler.handleBaseApp(ex, REQUEST_URI);
        assertEquals(Response.Status.INTERNAL_SERVER_ERROR.getStatusCode(), resp.getStatus());
    }

    // ---- WebApplicationException (replaces Spring's ResponseStatusException) ----

    @Test
    void handleWebApplicationException_preserves_status() {
        WebApplicationException ex =
                new WebApplicationException("forbidden", Response.Status.FORBIDDEN);
        Response resp = handler.handleWebApplicationException(ex, REQUEST_URI);
        assertEquals(Response.Status.FORBIDDEN.getStatusCode(), resp.getStatus());
        assertEquals("forbidden", body(resp).get("detail"));
        assertEquals(REQUEST_URI, body(resp).get("path"));
    }

    @Test
    void toResponse_dispatches_webApplicationException() {
        WebApplicationException ex =
                new WebApplicationException("conflict", Response.Status.CONFLICT);
        Response resp = handler.toResponse(ex);
        assertEquals(Response.Status.CONFLICT.getStatusCode(), resp.getStatus());
    }

    @Test
    void toResponse_dispatches_pdfPassword_to_400() {
        PdfPasswordException ex = new PdfPasswordException("pwd", null, "E001");
        Response resp = handler.toResponse(ex);
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), resp.getStatus());
        assertEquals("E001", body(resp).get("errorCode"));
    }

    // ---- IllegalArgumentException ----

    @Test
    void handleIllegalArgument_returns_400() {
        IllegalArgumentException ex = new IllegalArgumentException("bad arg");
        Response resp = handler.handleIllegalArgument(ex, REQUEST_URI);
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), resp.getStatus());
        assertTrue(((String) body(resp).get("detail")).contains("bad arg"));
    }

    // ---- IOException ----

    @Test
    void handleIOException_returns_500() {
        IOException ex = new IOException("read failed");
        Response resp = handler.handleIOException(ex, REQUEST_URI);
        assertEquals(Response.Status.INTERNAL_SERVER_ERROR.getStatusCode(), resp.getStatus());
    }

    @Test
    void handleIOException_brokenPipe_returns_empty_body() {
        IOException ex = new IOException("Broken pipe");
        Response resp = handler.handleIOException(ex, REQUEST_URI);
        assertEquals(Response.Status.INTERNAL_SERVER_ERROR.getStatusCode(), resp.getStatus());
        assertNull(resp.getEntity());
    }

    @Test
    void handleIOException_connectionReset_returns_empty_body() {
        IOException ex = new IOException("Connection reset by peer");
        Response resp = handler.handleIOException(ex, REQUEST_URI);
        assertNull(resp.getEntity());
    }

    @Test
    void handleIOException_noSuchFile_returns_500() {
        NoSuchFileException ex = new NoSuchFileException("/tmp/abc123.pdf");
        Response resp = handler.handleIOException(ex, REQUEST_URI);
        assertEquals(Response.Status.INTERNAL_SERVER_ERROR.getStatusCode(), resp.getStatus());
        assertNotNull(resp.getEntity());
    }

    // ---- RuntimeException wrapping ----

    @Test
    void handleRuntimeException_wrapping_PdfPasswordException_returns_400() {
        PdfPasswordException cause = new PdfPasswordException("pwd needed", null, "E001");
        RuntimeException ex = new RuntimeException("wrapped", cause);
        Response resp = handler.handleRuntimeException(ex, REQUEST_URI);
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), resp.getStatus());
    }

    @Test
    void handleRuntimeException_wrapping_BaseValidationException_returns_400() {
        CbrFormatException cause = new CbrFormatException("bad format", "E030");
        RuntimeException ex = new RuntimeException("wrapped", cause);
        Response resp = handler.handleRuntimeException(ex, REQUEST_URI);
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), resp.getStatus());
    }

    @Test
    void handleRuntimeException_wrapping_IOException_returns_500() {
        IOException cause = new IOException("io fail");
        RuntimeException ex = new RuntimeException("wrapped", cause);
        Response resp = handler.handleRuntimeException(ex, REQUEST_URI);
        assertEquals(Response.Status.INTERNAL_SERVER_ERROR.getStatusCode(), resp.getStatus());
    }

    @Test
    void handleRuntimeException_wrapping_IllegalArgumentException_returns_400() {
        IllegalArgumentException cause = new IllegalArgumentException("invalid");
        RuntimeException ex = new RuntimeException("wrapped", cause);
        Response resp = handler.handleRuntimeException(ex, REQUEST_URI);
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), resp.getStatus());
    }

    @Test
    void handleRuntimeException_wrapping_webApplicationException_preserves_status() {
        WebApplicationException cause =
                new WebApplicationException("nope", Response.Status.UNAUTHORIZED);
        RuntimeException ex = new RuntimeException("wrapped", cause);
        Response resp = handler.handleRuntimeException(ex, REQUEST_URI);
        assertEquals(Response.Status.UNAUTHORIZED.getStatusCode(), resp.getStatus());
    }

    @Test
    void handleRuntimeException_unwrapped_returns_500() {
        RuntimeException ex = new RuntimeException("plain runtime");
        Response resp = handler.handleRuntimeException(ex, REQUEST_URI);
        assertEquals(Response.Status.INTERNAL_SERVER_ERROR.getStatusCode(), resp.getStatus());
    }

    @Test
    void handleRuntimeException_devMode_includes_debug_info() {
        System.setProperty("quarkus.profile", "dev");
        try {
            GlobalExceptionHandler devHandler = new GlobalExceptionHandler();
            RuntimeException ex = new RuntimeException("debug me");
            Response resp = devHandler.handleRuntimeException(ex, REQUEST_URI);
            assertEquals("debug me", body(resp).get("debugMessage"));
            assertEquals(RuntimeException.class.getName(), body(resp).get("exceptionType"));
        } finally {
            System.clearProperty("quarkus.profile");
        }
    }

    // ---- Generic exception ----

    @Test
    void handleGenericException_returns_500() {
        Exception ex = new Exception("generic");
        Response resp = handler.handleGenericException(ex, REQUEST_URI);
        assertEquals(Response.Status.INTERNAL_SERVER_ERROR.getStatusCode(), resp.getStatus());
    }

    @Test
    void handleGenericException_devMode_includes_debug() {
        System.setProperty("quarkus.profile", "development");
        try {
            GlobalExceptionHandler devHandler = new GlobalExceptionHandler();
            Exception ex = new Exception("dev error");
            Response resp = devHandler.handleGenericException(ex, REQUEST_URI);
            assertEquals("dev error", body(resp).get("debugMessage"));
        } finally {
            System.clearProperty("quarkus.profile");
        }
    }

    // ---- Problem body contains standard fields ----

    @Test
    void problemDetail_contains_path_and_timestamp() {
        PdfPasswordException ex = new PdfPasswordException("msg", null, "E001");
        Response resp = handler.handlePdfPassword(ex, REQUEST_URI);
        assertEquals(REQUEST_URI, body(resp).get("path"));
        assertNotNull(body(resp).get("timestamp"));
    }

    @Test
    void problemDetail_contains_title() {
        GhostscriptException ex = new GhostscriptException("gs fail", null, "E010");
        Response resp = handler.handleGhostscriptException(ex, REQUEST_URI);
        assertNotNull(body(resp).get("title"));
    }

    // ---- RuntimeException wrapping GhostscriptException ----

    @Test
    void handleRuntimeException_wrapping_GhostscriptException_returns_500() {
        GhostscriptException cause = new GhostscriptException("gs fail", null, "E010");
        RuntimeException ex = new RuntimeException("wrapped", cause);
        Response resp = handler.handleRuntimeException(ex, REQUEST_URI);
        assertEquals(Response.Status.INTERNAL_SERVER_ERROR.getStatusCode(), resp.getStatus());
    }

    // ---- RuntimeException wrapping FfmpegRequiredException ----

    @Test
    void handleRuntimeException_wrapping_FfmpegRequired_returns_503() {
        FfmpegRequiredException cause = new FfmpegRequiredException("no ffmpeg", "E020");
        RuntimeException ex = new RuntimeException("wrapped", cause);
        Response resp = handler.handleRuntimeException(ex, REQUEST_URI);
        assertEquals(Response.Status.SERVICE_UNAVAILABLE.getStatusCode(), resp.getStatus());
    }

    // ---- RuntimeException wrapping generic BaseAppException ----

    @Test
    void handleRuntimeException_wrapping_generic_BaseAppException_returns_400() {
        PdfCorruptedException cause = new PdfCorruptedException("corrupted", null, "E002");
        RuntimeException wrapper = new RuntimeException("job failed", cause);
        // PdfCorruptedException is routed through handlePdfAndDpiExceptions -> BAD_REQUEST.
        Response resp = handler.handleRuntimeException(wrapper, REQUEST_URI);
        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), resp.getStatus());
    }
}
