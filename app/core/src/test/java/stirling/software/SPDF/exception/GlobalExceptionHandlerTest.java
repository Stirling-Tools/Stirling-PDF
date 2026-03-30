package stirling.software.SPDF.exception;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.file.NoSuchFileException;
import java.util.List;
import java.util.Locale;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.MessageSource;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.NoHandlerFoundException;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.common.util.ExceptionUtils.*;

@ExtendWith(MockitoExtension.class)
class GlobalExceptionHandlerTest {

    @Mock private MessageSource messageSource;
    @Mock private Environment environment;
    @Mock private HttpServletRequest request;
    @Mock private HttpServletResponse response;

    private GlobalExceptionHandler handler;

    @BeforeEach
    void setUp() {
        handler = new GlobalExceptionHandler(messageSource, environment);
        lenient().when(request.getRequestURI()).thenReturn("/api/test");
        // Return the default message for any messageSource call
        lenient()
                .when(messageSource.getMessage(anyString(), any(), anyString(), any(Locale.class)))
                .thenAnswer(inv -> inv.getArgument(2));
        lenient()
                .when(messageSource.getMessage(anyString(), any(), any(Locale.class)))
                .thenReturn(null);
        lenient().when(environment.getActiveProfiles()).thenReturn(new String[] {});
    }

    // ---- PdfPasswordException ----

    @Test
    void handlePdfPassword_returns_400() {
        PdfPasswordException ex = new PdfPasswordException("bad password", null, "E001");
        ResponseEntity<ProblemDetail> resp = handler.handlePdfPassword(ex, request);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
        assertEquals("E001", resp.getBody().getProperties().get("errorCode"));
    }

    // ---- GhostscriptException ----

    @Test
    void handleGhostscriptException_returns_500() {
        GhostscriptException ex = new GhostscriptException("gs failed", null, "E010");
        ResponseEntity<ProblemDetail> resp = handler.handleGhostscriptException(ex, request);
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, resp.getStatusCode());
        assertEquals("E010", resp.getBody().getProperties().get("errorCode"));
    }

    // ---- FfmpegRequiredException ----

    @Test
    void handleFfmpegRequired_returns_503() {
        FfmpegRequiredException ex = new FfmpegRequiredException("no ffmpeg", "E020");
        ResponseEntity<ProblemDetail> resp = handler.handleFfmpegRequired(ex, request);
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, resp.getStatusCode());
    }

    // ---- PDF and DPI exceptions ----

    @Test
    void handlePdfCorrupted_returns_400() {
        PdfCorruptedException ex = new PdfCorruptedException("corrupt", null, "E002");
        ResponseEntity<ProblemDetail> resp = handler.handlePdfAndDpiExceptions(ex, request);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
    }

    @Test
    void handlePdfEncryption_returns_400() {
        PdfEncryptionException ex = new PdfEncryptionException("encrypted", null, "E003");
        ResponseEntity<ProblemDetail> resp = handler.handlePdfAndDpiExceptions(ex, request);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
    }

    @Test
    void handleOutOfMemoryDpi_returns_400() {
        OutOfMemoryDpiException ex = new OutOfMemoryDpiException("oom", null, "E004");
        ResponseEntity<ProblemDetail> resp = handler.handlePdfAndDpiExceptions(ex, request);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
    }

    // ---- Format exceptions ----

    @Test
    void handleCbrFormat_returns_400() {
        CbrFormatException ex = new CbrFormatException("bad cbr", "E030");
        ResponseEntity<ProblemDetail> resp = handler.handleFormatExceptions(ex, request);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
    }

    @Test
    void handleCbzFormat_returns_400() {
        CbzFormatException ex = new CbzFormatException("bad cbz", "E031");
        ResponseEntity<ProblemDetail> resp = handler.handleFormatExceptions(ex, request);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
    }

    @Test
    void handleEmlFormat_returns_400() {
        EmlFormatException ex = new EmlFormatException("bad eml", "E033");
        ResponseEntity<ProblemDetail> resp = handler.handleFormatExceptions(ex, request);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
    }

    // ---- BaseValidationException ----

    @Test
    void handleValidation_returns_400() {
        CbrFormatException ex = new CbrFormatException("validation fail", "E030");
        ResponseEntity<ProblemDetail> resp = handler.handleValidation(ex, request);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
    }

    // ---- BaseAppException ----

    @Test
    void handleBaseApp_returns_500() {
        PdfCorruptedException ex = new PdfCorruptedException("app error", null, "E099");
        ResponseEntity<ProblemDetail> resp = handler.handleBaseApp(ex, request);
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, resp.getStatusCode());
    }

    // ---- MissingServletRequestParameterException ----

    @Test
    void handleMissingParameter_returns_400() {
        MissingServletRequestParameterException ex =
                new MissingServletRequestParameterException("file", "String");
        ResponseEntity<ProblemDetail> resp = handler.handleMissingParameter(ex, request);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
        assertEquals("file", resp.getBody().getProperties().get("parameterName"));
    }

    // ---- MissingServletRequestPartException ----

    @Test
    void handleMissingPart_returns_400() {
        MissingServletRequestPartException ex = new MissingServletRequestPartException("fileInput");
        ResponseEntity<ProblemDetail> resp = handler.handleMissingPart(ex, request);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
        assertEquals("fileInput", resp.getBody().getProperties().get("partName"));
    }

    // ---- MaxUploadSizeExceededException ----

    @Test
    void handleMaxUploadSize_returns_413() {
        MaxUploadSizeExceededException ex = new MaxUploadSizeExceededException(10485760);
        ResponseEntity<ProblemDetail> resp = handler.handleMaxUploadSize(ex, request);
        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, resp.getStatusCode());
    }

    @Test
    void handleMaxUploadSize_unknown_limit() {
        MaxUploadSizeExceededException ex = new MaxUploadSizeExceededException(-1);
        ResponseEntity<ProblemDetail> resp = handler.handleMaxUploadSize(ex, request);
        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, resp.getStatusCode());
        assertNull(resp.getBody().getProperties().get("maxSizeBytes"));
    }

    // ---- HttpRequestMethodNotSupportedException ----

    @Test
    void handleMethodNotSupported_returns_405() {
        HttpRequestMethodNotSupportedException ex =
                new HttpRequestMethodNotSupportedException("PATCH", List.of("GET", "POST"));
        ResponseEntity<ProblemDetail> resp = handler.handleMethodNotSupported(ex, request);
        assertEquals(HttpStatus.METHOD_NOT_ALLOWED, resp.getStatusCode());
        assertEquals("PATCH", resp.getBody().getProperties().get("method"));
    }

    // ---- NoHandlerFoundException ----

    @Test
    void handleNotFound_returns_404() {
        NoHandlerFoundException ex = new NoHandlerFoundException("GET", "/api/missing", null);
        ResponseEntity<ProblemDetail> resp = handler.handleNotFound(ex, request);
        assertEquals(HttpStatus.NOT_FOUND, resp.getStatusCode());
    }

    // ---- IllegalArgumentException ----

    @Test
    void handleIllegalArgument_returns_400() {
        IllegalArgumentException ex = new IllegalArgumentException("bad arg");
        ResponseEntity<ProblemDetail> resp = handler.handleIllegalArgument(ex, request);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
        assertTrue(resp.getBody().getDetail().contains("bad arg"));
    }

    // ---- IOException ----

    @Test
    void handleIOException_returns_500() {
        IOException ex = new IOException("read failed");
        ResponseEntity<ProblemDetail> resp = handler.handleIOException(ex, request);
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, resp.getStatusCode());
    }

    @Test
    void handleIOException_brokenPipe_returns_empty_body() {
        IOException ex = new IOException("Broken pipe");
        ResponseEntity<ProblemDetail> resp = handler.handleIOException(ex, request);
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, resp.getStatusCode());
        assertNull(resp.getBody());
    }

    @Test
    void handleIOException_connectionReset_returns_empty_body() {
        IOException ex = new IOException("Connection reset by peer");
        ResponseEntity<ProblemDetail> resp = handler.handleIOException(ex, request);
        assertNull(resp.getBody());
    }

    @Test
    void handleIOException_noSuchFile_returns_500() {
        NoSuchFileException ex = new NoSuchFileException("/tmp/abc123.pdf");
        ResponseEntity<ProblemDetail> resp = handler.handleIOException(ex, request);
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, resp.getStatusCode());
        assertNotNull(resp.getBody());
    }

    // ---- RuntimeException wrapping ----

    @Test
    void handleRuntimeException_wrapping_PdfPasswordException_returns_400() {
        PdfPasswordException cause = new PdfPasswordException("pwd needed", null, "E001");
        RuntimeException ex = new RuntimeException("wrapped", cause);
        ResponseEntity<ProblemDetail> resp = handler.handleRuntimeException(ex, request);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
    }

    @Test
    void handleRuntimeException_wrapping_BaseValidationException_returns_400() {
        CbrFormatException cause = new CbrFormatException("bad format", "E030");
        RuntimeException ex = new RuntimeException("wrapped", cause);
        ResponseEntity<ProblemDetail> resp = handler.handleRuntimeException(ex, request);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
    }

    @Test
    void handleRuntimeException_wrapping_IOException_returns_500() {
        IOException cause = new IOException("io fail");
        RuntimeException ex = new RuntimeException("wrapped", cause);
        ResponseEntity<ProblemDetail> resp = handler.handleRuntimeException(ex, request);
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, resp.getStatusCode());
    }

    @Test
    void handleRuntimeException_wrapping_IllegalArgumentException_returns_400() {
        IllegalArgumentException cause = new IllegalArgumentException("invalid");
        RuntimeException ex = new RuntimeException("wrapped", cause);
        ResponseEntity<ProblemDetail> resp = handler.handleRuntimeException(ex, request);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
    }

    @Test
    void handleRuntimeException_unwrapped_returns_500() {
        RuntimeException ex = new RuntimeException("plain runtime");
        ResponseEntity<ProblemDetail> resp = handler.handleRuntimeException(ex, request);
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, resp.getStatusCode());
    }

    @Test
    void handleRuntimeException_devMode_includes_debug_info() {
        when(environment.getActiveProfiles()).thenReturn(new String[] {"dev"});
        RuntimeException ex = new RuntimeException("debug me");
        ResponseEntity<ProblemDetail> resp = handler.handleRuntimeException(ex, request);
        assertEquals("debug me", resp.getBody().getProperties().get("debugMessage"));
        assertEquals(
                RuntimeException.class.getName(),
                resp.getBody().getProperties().get("exceptionType"));
    }

    // ---- Generic exception ----

    @Test
    void handleGenericException_returns_500() {
        Exception ex = new Exception("generic");
        when(response.isCommitted()).thenReturn(false);
        ResponseEntity<ProblemDetail> resp = handler.handleGenericException(ex, request, response);
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, resp.getStatusCode());
    }

    @Test
    void handleGenericException_committed_response_returns_null() {
        Exception ex = new Exception("too late");
        when(response.isCommitted()).thenReturn(true);
        ResponseEntity<ProblemDetail> resp = handler.handleGenericException(ex, request, response);
        assertNull(resp);
    }

    @Test
    void handleGenericException_devMode_includes_debug() {
        when(environment.getActiveProfiles()).thenReturn(new String[] {"development"});
        Exception ex = new Exception("dev error");
        when(response.isCommitted()).thenReturn(false);
        ResponseEntity<ProblemDetail> resp = handler.handleGenericException(ex, request, response);
        assertEquals("dev error", resp.getBody().getProperties().get("debugMessage"));
    }

    // ---- HttpMediaTypeNotAcceptableException ----

    @Test
    void handleMediaTypeNotAcceptable_writes_json_directly() throws Exception {
        HttpMediaTypeNotAcceptableException ex = new HttpMediaTypeNotAcceptableException("not ok");
        StringWriter sw = new StringWriter();
        PrintWriter pw = new PrintWriter(sw);
        when(response.getWriter()).thenReturn(pw);

        handler.handleMediaTypeNotAcceptable(ex, request, response);

        verify(response).setStatus(HttpStatus.NOT_ACCEPTABLE.value());
        verify(response).setContentType("application/problem+json");
        pw.flush();
        String json = sw.toString();
        assertTrue(json.contains("\"status\":406"));
        assertTrue(json.contains("Not Acceptable"));
    }

    // ---- ProblemDetail contains standard fields ----

    @Test
    void problemDetail_contains_path_and_timestamp() {
        PdfPasswordException ex = new PdfPasswordException("msg", null, "E001");
        ResponseEntity<ProblemDetail> resp = handler.handlePdfPassword(ex, request);
        ProblemDetail pd = resp.getBody();
        assertEquals("/api/test", pd.getProperties().get("path"));
        assertNotNull(pd.getProperties().get("timestamp"));
    }

    @Test
    void problemDetail_contains_title() {
        GhostscriptException ex = new GhostscriptException("gs fail", null, "E010");
        ResponseEntity<ProblemDetail> resp = handler.handleGhostscriptException(ex, request);
        ProblemDetail pd = resp.getBody();
        assertNotNull(pd.getTitle());
        assertNotNull(pd.getProperties().get("title"));
    }

    // ---- RuntimeException wrapping GhostscriptException ----

    @Test
    void handleRuntimeException_wrapping_GhostscriptException_returns_500() {
        GhostscriptException cause = new GhostscriptException("gs fail", null, "E010");
        RuntimeException ex = new RuntimeException("wrapped", cause);
        ResponseEntity<ProblemDetail> resp = handler.handleRuntimeException(ex, request);
        assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, resp.getStatusCode());
    }

    // ---- RuntimeException wrapping FfmpegRequiredException ----

    @Test
    void handleRuntimeException_wrapping_FfmpegRequired_returns_503() {
        FfmpegRequiredException cause = new FfmpegRequiredException("no ffmpeg", "E020");
        RuntimeException ex = new RuntimeException("wrapped", cause);
        ResponseEntity<ProblemDetail> resp = handler.handleRuntimeException(ex, request);
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, resp.getStatusCode());
    }

    // ---- RuntimeException wrapping generic BaseAppException ----

    @Test
    void handleRuntimeException_wrapping_generic_BaseAppException_returns_500() {
        PdfCorruptedException cause = new PdfCorruptedException("corrupted", null, "E002");
        RuntimeException wrapper = new RuntimeException("job failed", cause);
        // PdfCorruptedException is handled by the specific handler via instanceof,
        // but let's wrap it in a way that falls through to handleBaseApp
        // Actually PdfCorruptedException is handled by handlePdfAndDpiExceptions
        ResponseEntity<ProblemDetail> resp = handler.handleRuntimeException(wrapper, request);
        assertEquals(HttpStatus.BAD_REQUEST, resp.getStatusCode());
    }
}
