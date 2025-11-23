package stirling.software.SPDF.exception;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.net.URI;
import java.time.Instant;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.MessageSource;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;
import org.springframework.web.servlet.NoHandlerFoundException;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.ExceptionUtils.BaseValidationException;
import stirling.software.common.util.ExceptionUtils.CbrFormatException;
import stirling.software.common.util.ExceptionUtils.GhostscriptException;
import stirling.software.common.util.ExceptionUtils.PdfCorruptedException;
import stirling.software.common.util.ExceptionUtils.PdfPasswordException;

@ExtendWith(MockitoExtension.class)
@DisplayName("GlobalExceptionHandler Tests")
class GlobalExceptionHandlerTest {

    private static final int MIN_HINTS_SIMPLE = 1;
    private static final int MIN_HINTS_DETAILED = 3;

    @Mock private MessageSource messageSource;

    @Mock private Environment environment;

    @Mock private HttpServletRequest request;

    @InjectMocks private GlobalExceptionHandler exceptionHandler;

    @BeforeEach
    void setUp() {
        // Only set up request URI as default (most tests override anyway)
        lenient().when(request.getRequestURI()).thenReturn("/api/v1/test/endpoint");
        // MessageSource is used by most exception handlers for localization
        lenient()
                .when(messageSource.getMessage(anyString(), isNull(), anyString(), any()))
                .thenAnswer(invocation -> invocation.getArgument(2));
        // Environment is used by isDevelopmentMode() in some handlers
        lenient().when(environment.getActiveProfiles()).thenReturn(new String[] {});
    }

    private void assertRfc7807Compliant(ProblemDetail detail, HttpStatus expectedStatus) {
        assertAll(
                "RFC 7807 compliance",
                () -> assertNotNull(detail.getType(), "type is required"),
                () -> assertNotNull(detail.getTitle(), "title is required"),
                () -> assertEquals(expectedStatus.value(), detail.getStatus(), "status mismatch"));
    }

    private void assertHasMinimalHints(ProblemDetail detail, int minCount) {
        @SuppressWarnings("unchecked")
        List<String> hints = (List<String>) detail.getProperties().get("hints");
        assertNotNull(hints, "hints should be present");
        assertTrue(hints.size() >= minCount, "should have at least " + minCount + " hints");
        assertTrue(
                hints.stream().allMatch(h -> h != null && !h.trim().isEmpty()),
                "all hints should be non-null and non-empty");
        // Check that hints look like proper sentences (start with capital, end with punctuation)
        assertTrue(
                hints.stream().allMatch(h -> h.matches("^[A-Z].*[.!?]$")),
                "hints should be proper sentences");
    }

    private void assertStandardErrorStructure(
            ResponseEntity<ProblemDetail> response, HttpStatus expectedStatus) {
        assertAll(
                "Standard error response structure",
                () -> assertEquals(expectedStatus, response.getStatusCode()),
                () ->
                        assertEquals(
                                MediaType.APPLICATION_PROBLEM_JSON,
                                response.getHeaders().getContentType()),
                () -> assertNotNull(response.getBody()),
                () -> assertRfc7807Compliant(response.getBody(), expectedStatus),
                () ->
                        assertTrue(
                                response.getBody().getProperties().containsKey("timestamp"),
                                "timestamp should be present"),
                () ->
                        assertTrue(
                                response.getBody().getProperties().containsKey("path"),
                                "path should be present"));
    }

    @Nested
    @DisplayName("Security Exceptions")
    @ConditionalOnClass(
            name =
                    "org.springframework.security.access.org.springframework.security.access.AccessDeniedException")
    class SecurityExceptionTests {

        @Test
        @DisplayName(
                "org.springframework.security.access.AccessDeniedException returns 403 Forbidden")
        void testHandleAccessDenied() {
            when(request.getRequestURI()).thenReturn("/api/v1/admin/settings");
            org.springframework.security.access.AccessDeniedException ex =
                    new org.springframework.security.access.AccessDeniedException(
                            "Access is denied");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleAccessDenied(ex, request);

            assertStandardErrorStructure(response, HttpStatus.FORBIDDEN);
            ProblemDetail detail = response.getBody();
            assertAll(
                    () -> assertEquals(URI.create("/errors/access-denied"), detail.getType()),
                    () -> assertEquals("Access Denied", detail.getTitle()),
                    () -> assertNotNull(detail.getProperties().get("timestamp")),
                    () -> assertTrue(detail.getProperties().containsKey("hints")),
                    () -> assertTrue(detail.getProperties().containsKey("actionRequired")),
                    () -> assertNotNull(detail.getDetail(), "detail should contain message"));
        }

        @Test
        @DisplayName(
                "org.springframework.security.access.AccessDeniedException with null message handled gracefully")
        void testHandleAccessDeniedWithNullMessage() {
            when(request.getRequestURI()).thenReturn("/api/v1/admin/settings");
            org.springframework.security.access.AccessDeniedException ex =
                    new org.springframework.security.access.AccessDeniedException(null);

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleAccessDenied(ex, request);

            assertStandardErrorStructure(response, HttpStatus.FORBIDDEN);
            ProblemDetail detail = response.getBody();
            assertAll(
                    () -> assertEquals(URI.create("/errors/access-denied"), detail.getType()),
                    () -> assertEquals("Access Denied", detail.getTitle()),
                    () ->
                            assertNotNull(
                                    detail.getDetail(),
                                    "detail should have fallback message even when exception message is null"));
        }

        @Test
        @DisplayName(
                "org.springframework.security.access.AccessDeniedException message is properly included in response")
        void testHandleAccessDeniedMessageLocalization() {
            when(request.getRequestURI()).thenReturn("/api/v1/admin/users");
            String customMessage = "User does not have permission to access user management";
            org.springframework.security.access.AccessDeniedException ex =
                    new org.springframework.security.access.AccessDeniedException(customMessage);

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleAccessDenied(ex, request);

            assertStandardErrorStructure(response, HttpStatus.FORBIDDEN);
            ProblemDetail detail = response.getBody();
            assertAll(
                    () ->
                            assertTrue(
                                    detail.getDetail().contains("permission")
                                            || detail.getDetail().contains("access"),
                                    "detail should contain meaningful access denial information"));
        }
    }

    @Nested
    @DisplayName("Spring Framework Exceptions")
    class SpringFrameworkExceptionTests {

        @Test
        @DisplayName("HttpMessageNotReadableException returns 400")
        void testHandleMessageNotReadable() {
            HttpMessageNotReadableException ex =
                    new HttpMessageNotReadableException("Invalid JSON", (HttpInputMessage) null);

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleMessageNotReadable(ex, request);

            assertStandardErrorStructure(response, HttpStatus.BAD_REQUEST);
            assertEquals(URI.create("/errors/malformed-request"), response.getBody().getType());
        }

        @Test
        @DisplayName("HttpMediaTypeNotSupportedException returns 415")
        void testHandleMediaTypeNotSupported() {
            HttpMediaTypeNotSupportedException ex =
                    new HttpMediaTypeNotSupportedException("Content-Type not supported");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleMediaTypeNotSupported(ex, request);

            assertStandardErrorStructure(response, HttpStatus.UNSUPPORTED_MEDIA_TYPE);
            assertEquals(
                    URI.create("/errors/unsupported-media-type"), response.getBody().getType());
        }

        @Test
        @DisplayName("HttpRequestMethodNotSupportedException returns 405")
        void testHandleMethodNotSupported() {
            HttpRequestMethodNotSupportedException ex =
                    new HttpRequestMethodNotSupportedException(
                            "POST", java.util.List.of("GET", "PUT"));

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleMethodNotSupported(ex, request);

            assertStandardErrorStructure(response, HttpStatus.METHOD_NOT_ALLOWED);
            assertEquals(URI.create("/errors/method-not-allowed"), response.getBody().getType());
        }

        @Test
        @DisplayName("NoHandlerFoundException returns 404")
        void testHandleNotFound() {
            NoHandlerFoundException ex =
                    new NoHandlerFoundException("GET", "/api/v1/unknown", null);

            ResponseEntity<ProblemDetail> response = exceptionHandler.handleNotFound(ex, request);

            assertStandardErrorStructure(response, HttpStatus.NOT_FOUND);
            assertEquals(URI.create("/errors/not-found"), response.getBody().getType());
        }

        @Test
        @DisplayName("MissingServletRequestParameterException returns 400")
        void testHandleMissingParameter() {
            MissingServletRequestParameterException ex =
                    new MissingServletRequestParameterException("param", "String");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleMissingParameter(ex, request);

            assertStandardErrorStructure(response, HttpStatus.BAD_REQUEST);
            assertEquals(URI.create("/errors/missing-parameter"), response.getBody().getType());
        }

        @Test
        @DisplayName("MissingServletRequestPartException returns 400")
        void testHandleMissingPart() {
            MissingServletRequestPartException ex = new MissingServletRequestPartException("file");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleMissingPart(ex, request);

            assertStandardErrorStructure(response, HttpStatus.BAD_REQUEST);
            assertEquals(URI.create("/errors/missing-file"), response.getBody().getType());
        }

        @Test
        @DisplayName("MaxUploadSizeExceededException returns 413")
        void testHandleMaxUploadSize() {
            MaxUploadSizeExceededException ex = new MaxUploadSizeExceededException(10485760);

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleMaxUploadSize(ex, request);

            assertStandardErrorStructure(response, HttpStatus.PAYLOAD_TOO_LARGE);
            assertEquals(URI.create("/errors/file-too-large"), response.getBody().getType());
        }
    }

    @Nested
    @DisplayName("Application Exceptions")
    class ApplicationExceptionTests {

        @Test
        @DisplayName("GhostscriptException returns 500")
        void testHandleGhostscriptException() {
            GhostscriptException ex = ExceptionUtils.createGhostscriptCompressionException();

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleGhostscriptException(ex, request);

            assertStandardErrorStructure(response, HttpStatus.INTERNAL_SERVER_ERROR);
            ProblemDetail detail = response.getBody();
            assertAll(
                    () -> assertEquals(URI.create("/errors/ghostscript"), detail.getType()),
                    () -> assertTrue(detail.getDetail().contains("Ghostscript")),
                    () -> assertNotNull(detail.getProperties().get("errorCode")));
        }

        @Test
        @DisplayName("PdfCorruptedException returns 400")
        void testHandlePdfCorruptedException() {
            PdfCorruptedException ex =
                    ExceptionUtils.createPdfCorruptedException(
                            "during load", new IOException("Invalid PDF"));

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handlePdfAndDpiExceptions(ex, request);

            assertStandardErrorStructure(response, HttpStatus.BAD_REQUEST);
            assertAll(
                    () ->
                            assertEquals(
                                    URI.create("/errors/pdf-corrupted"),
                                    response.getBody().getType()),
                    () -> assertNotNull(response.getBody().getProperties().get("errorCode")));
        }

        @Test
        @DisplayName("PdfPasswordException returns 400")
        void testHandlePdfPasswordException() {
            PdfPasswordException ex =
                    ExceptionUtils.createPdfPasswordException(new IOException("Password required"));

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handlePdfPassword(ex, request);

            assertStandardErrorStructure(response, HttpStatus.BAD_REQUEST);
            assertAll(
                    () ->
                            assertEquals(
                                    URI.create("/errors/pdf-password"),
                                    response.getBody().getType()),
                    () -> assertNotNull(response.getBody().getProperties().get("errorCode")));
        }
    }

    @Nested
    @DisplayName("Validation Exceptions")
    class ValidationExceptionTests {

        @Test
        @DisplayName("BaseValidationException returns 400")
        void testHandleValidation() {
            BaseValidationException ex =
                    ExceptionUtils.createCbrInvalidFormatException("Invalid CBR format");

            ResponseEntity<ProblemDetail> response = exceptionHandler.handleValidation(ex, request);

            assertStandardErrorStructure(response, HttpStatus.BAD_REQUEST);
            assertAll(
                    () ->
                            assertEquals(
                                    URI.create("/errors/validation"), response.getBody().getType()),
                    () -> assertNotNull(response.getBody().getProperties().get("errorCode")));
        }
    }

    @Nested
    @DisplayName("Java Standard Exceptions")
    class JavaStandardExceptionTests {

        @Test
        @DisplayName("IllegalArgumentException returns 400")
        void testHandleIllegalArgument() {
            IllegalArgumentException ex =
                    new IllegalArgumentException("Unsupported eBook file extension: pdf");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleIllegalArgument(ex, request);

            assertStandardErrorStructure(response, HttpStatus.BAD_REQUEST);
            assertAll(
                    () ->
                            assertEquals(
                                    URI.create("/errors/invalid-argument"),
                                    response.getBody().getType()),
                    () -> assertTrue(response.getBody().getDetail().contains("Unsupported eBook")));
        }

        @Test
        @DisplayName("IOException returns 500")
        void testHandleIOException() {
            IOException ex = new IOException("File processing error");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleIOException(ex, request);

            assertStandardErrorStructure(response, HttpStatus.INTERNAL_SERVER_ERROR);
            assertEquals(URI.create("/errors/io-error"), response.getBody().getType());
        }

        @Test
        @DisplayName("Generic Exception returns 500")
        void testHandleGenericException() {
            Exception ex = new Exception("Unexpected error occurred");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleGenericException(ex, request);

            assertStandardErrorStructure(response, HttpStatus.INTERNAL_SERVER_ERROR);
            ProblemDetail detail = response.getBody();
            assertAll(
                    () -> assertEquals(URI.create("/errors/unexpected"), detail.getType()),
                    () -> assertTrue(detail.getDetail().contains("An unexpected error")));
        }

        @Test
        @DisplayName("IllegalArgumentException with special characters in message")
        void testIllegalArgumentWithSpecialCharacters() {
            when(request.getRequestURI()).thenReturn("/api/v1/admin/settings");
            String maliciousMessage = "<script>alert('xss')</script>";
            IllegalArgumentException ex = new IllegalArgumentException(maliciousMessage);

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleIllegalArgument(ex, request);
            ProblemDetail detail = response.getBody();
            assertAll(
                    "XSS sanitization",
                    () -> assertNotNull(detail),
                    () -> {
                        String bodyDetail = detail.getDetail();
                        assertNotNull(bodyDetail, "detail should not be null");
                        assertFalse(
                                bodyDetail.contains("<script>"),
                                "should not contain raw script tag");
                        assertFalse(
                                bodyDetail.contains("</script>"),
                                "should not contain raw closing script tag");
                        assertTrue(
                                bodyDetail.contains("&lt;script&gt;"),
                                "should contain HTML-escaped script tag");
                        assertTrue(
                                bodyDetail.contains("&lt;/script&gt;"),
                                "should contain HTML-escaped closing script tag");
                    });
        }
    }

    @Nested
    @DisplayName("Problem Detail Structure")
    class ProblemDetailStructureTests {

        @Test
        @DisplayName("Contains all RFC 7807 properties")
        void testProblemDetailStructure() {
            IllegalArgumentException ex = new IllegalArgumentException("Test error");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleIllegalArgument(ex, request);

            assertRfc7807Compliant(response.getBody(), HttpStatus.BAD_REQUEST);
            ProblemDetail detail = response.getBody();
            assertAll(
                    () -> assertNotNull(detail.getProperties().get("timestamp")),
                    () -> assertNotNull(detail.getProperties().get("path")));
        }

        @Test
        @DisplayName("Hints array is present and populated")
        void testProblemDetailWithHints() {
            IllegalArgumentException ex = new IllegalArgumentException("Test error");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleIllegalArgument(ex, request);

            assertHasMinimalHints(response.getBody(), MIN_HINTS_SIMPLE);
        }

        @Test
        @DisplayName("Error code present for validation exceptions")
        void testProblemDetailWithErrorCode() {
            BaseValidationException ex =
                    ExceptionUtils.createCbrInvalidFormatException("Invalid format");

            ResponseEntity<ProblemDetail> response = exceptionHandler.handleValidation(ex, request);
            ProblemDetail detail = response.getBody();

            assertAll(
                    () -> assertTrue(detail.getProperties().containsKey("errorCode")),
                    () -> assertNotNull(detail.getProperties().get("errorCode")));
        }
    }

    @Nested
    @DisplayName("API Endpoint Tests")
    class RealWorldEndpointTests {

        private static Stream<Arguments> provideValidationExceptions() {
            return Stream.of(
                    Arguments.of(
                            "/api/v1/convert/eml/pdf",
                            ExceptionUtils.createEmlInvalidFormatException()),
                    Arguments.of(
                            "/api/v1/convert/cbz/pdf",
                            ExceptionUtils.createCbzInvalidFormatException(
                                    new IOException("Invalid CBZ"))),
                    Arguments.of(
                            "/api/v1/convert/cbr/pdf",
                            ExceptionUtils.createCbrInvalidFormatException("Invalid CBR")));
        }

        @Test
        @DisplayName("/api/v1/security/auto-redact returns 400 for invalid request")
        void testAutoRedactInvalidRequest() {
            when(request.getRequestURI()).thenReturn("/api/v1/security/auto-redact");
            HttpMessageNotReadableException ex =
                    new HttpMessageNotReadableException(
                            "Invalid request content.", (HttpInputMessage) null);

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleMessageNotReadable(ex, request);

            assertStandardErrorStructure(response, HttpStatus.BAD_REQUEST);
        }

        @Test
        @DisplayName("/api/v1/convert/url/pdf returns 415 for unsupported type")
        void testUrlToPdfUnsupportedMediaType() {
            when(request.getRequestURI()).thenReturn("/api/v1/convert/url/pdf");
            HttpMediaTypeNotSupportedException ex =
                    new HttpMediaTypeNotSupportedException("Content-Type not supported");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleMediaTypeNotSupported(ex, request);

            assertStandardErrorStructure(response, HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        }

        @Test
        @DisplayName("POST /api/v1/convert/pdf/vector should return 500 for Ghostscript error")
        void testPdfToVectorGhostscriptError() {

            when(request.getRequestURI()).thenReturn("/api/v1/convert/pdf/vector");
            GhostscriptException ex =
                    ExceptionUtils.createGhostscriptCompressionException(
                            "Page drawing error occurred", new IOException("Ghostscript error"));

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleGhostscriptException(ex, request);

            assertAll(
                    "PDF to Vector Ghostscript Error Response",
                    () -> assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode()),
                    () -> assertNotNull(response.getBody()),
                    () ->
                            assertEquals(
                                    HttpStatus.INTERNAL_SERVER_ERROR.value(),
                                    response.getBody().getStatus()),
                    () ->
                            assertEquals(
                                    "/api/v1/convert/pdf/vector",
                                    response.getBody().getProperties().get("path")),
                    () ->
                            assertEquals(
                                    URI.create("/errors/ghostscript"),
                                    response.getBody().getType()));
        }

        @Test
        @DisplayName("POST /api/v1/convert/ebook/pdf should return 400 for unsupported extension")
        void testEbookToPdfUnsupportedExtension() {

            when(request.getRequestURI()).thenReturn("/api/v1/convert/ebook/pdf");
            IllegalArgumentException ex =
                    new IllegalArgumentException("Unsupported eBook file extension: pdf");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleIllegalArgument(ex, request);

            assertAll(
                    "Ebook to PDF Unsupported Extension Response",
                    () -> assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode()),
                    () -> assertNotNull(response.getBody()),
                    () ->
                            assertEquals(
                                    HttpStatus.BAD_REQUEST.value(), response.getBody().getStatus()),
                    () ->
                            assertEquals(
                                    "/api/v1/convert/ebook/pdf",
                                    response.getBody().getProperties().get("path")),
                    () ->
                            assertEquals(
                                    URI.create("/errors/invalid-argument"),
                                    response.getBody().getType()),
                    () -> assertTrue(response.getBody().getProperties().containsKey("hints")));
        }

        @Test
        @DisplayName("Admin endpoints handle errors gracefully")
        void testAdminEndpointsHandleErrors() {
            when(request.getRequestURI()).thenReturn("/api/v1/admin/settings");
            Exception ex = new RuntimeException("Admin error");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleGenericException(ex, request);

            assertStandardErrorStructure(response, HttpStatus.INTERNAL_SERVER_ERROR);
        }

        @Test
        @DisplayName("Conversion endpoints return 500 for IOException")
        void testConversionEndpointsIOException() {
            when(request.getRequestURI()).thenReturn("/api/v1/convert/pdf/html");
            IOException ex = new IOException("Conversion failed");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleIOException(ex, request);

            assertStandardErrorStructure(response, HttpStatus.INTERNAL_SERVER_ERROR);
            assertEquals(URI.create("/errors/io-error"), response.getBody().getType());
        }

        @ParameterizedTest(name = "{0} → {1} → 400")
        @MethodSource("provideValidationExceptions")
        @DisplayName("Format validation exceptions return 400 with errorCode")
        void testFormatValidationExceptions(String endpoint, BaseValidationException exception) {
            when(request.getRequestURI()).thenReturn(endpoint);

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleValidation(exception, request);

            assertStandardErrorStructure(response, HttpStatus.BAD_REQUEST);
            assertTrue(response.getBody().getProperties().containsKey("errorCode"));
        }

        @Test
        @DisplayName("POST /api/v1/convert/pdf/pdfa should return 400 for corrupted PDF")
        void testPdfToPdfACorruptedFile() {

            when(request.getRequestURI()).thenReturn("/api/v1/convert/pdf/pdfa");
            PdfCorruptedException ex =
                    ExceptionUtils.createPdfCorruptedException(
                            "during PDF/A conversion", new IOException("Invalid PDF structure"));

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handlePdfAndDpiExceptions(ex, request);

            assertAll(
                    "PDF to PDF/A Corrupted File Response",
                    () -> assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode()),
                    () -> assertNotNull(response.getBody()),
                    () ->
                            assertEquals(
                                    "/api/v1/convert/pdf/pdfa",
                                    response.getBody().getProperties().get("path")),
                    () -> assertTrue(response.getBody().getProperties().containsKey("errorCode")));
        }

        @Test
        @DisplayName("POST /api/v1/merge should return 400 for missing file parameter")
        void testMergeMissingFileParameter() {

            when(request.getRequestURI()).thenReturn("/api/v1/merge");
            MissingServletRequestPartException ex =
                    new MissingServletRequestPartException("fileInput");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleMissingPart(ex, request);

            assertAll(
                    "Merge Missing File Parameter Response",
                    () -> assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode()),
                    () -> assertNotNull(response.getBody()),
                    () ->
                            assertEquals(
                                    "/api/v1/merge",
                                    response.getBody().getProperties().get("path")));
        }

        @Test
        @DisplayName("POST /api/v1/split should return 400 for invalid page range")
        void testSplitInvalidPageRange() {

            when(request.getRequestURI()).thenReturn("/api/v1/split");
            IllegalArgumentException ex = new IllegalArgumentException("Invalid page range: 10-5");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleIllegalArgument(ex, request);

            assertAll(
                    "Split Invalid Page Range Response",
                    () -> assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode()),
                    () -> assertNotNull(response.getBody()),
                    () ->
                            assertEquals(
                                    "/api/v1/split",
                                    response.getBody().getProperties().get("path")),
                    () -> assertTrue(response.getBody().getProperties().containsKey("hints")));
        }

        @Test
        @DisplayName("POST /api/v1/compress should return 500 for Ghostscript compression error")
        void testCompressGhostscriptError() {

            when(request.getRequestURI()).thenReturn("/api/v1/compress");
            GhostscriptException ex =
                    ExceptionUtils.createGhostscriptCompressionException(
                            "Compression failed", new IOException("Ghostscript error"));

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleGhostscriptException(ex, request);

            assertAll(
                    "Compress Ghostscript Error Response",
                    () -> assertEquals(HttpStatus.INTERNAL_SERVER_ERROR, response.getStatusCode()),
                    () -> assertNotNull(response.getBody()),
                    () ->
                            assertEquals(
                                    "/api/v1/compress",
                                    response.getBody().getProperties().get("path")),
                    () ->
                            assertEquals(
                                    URI.create("/errors/ghostscript"),
                                    response.getBody().getType()));
        }

        @Test
        @DisplayName("POST /api/v1/rotate should return 400 for password-protected PDF")
        void testRotatePasswordProtectedPdf() {

            when(request.getRequestURI()).thenReturn("/api/v1/rotate");
            PdfPasswordException ex =
                    ExceptionUtils.createPdfPasswordException(new IOException("Password required"));

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handlePdfPassword(ex, request);

            assertAll(
                    "Rotate Password Protected PDF Response",
                    () -> assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode()),
                    () -> assertNotNull(response.getBody()),
                    () ->
                            assertEquals(
                                    "/api/v1/rotate",
                                    response.getBody().getProperties().get("path")),
                    () -> assertTrue(response.getBody().getProperties().containsKey("errorCode")));
        }

        @Test
        @DisplayName("POST /api/v1/extract should return 413 for file too large")
        void testExtractFileTooLarge() {

            when(request.getRequestURI()).thenReturn("/api/v1/extract");
            MaxUploadSizeExceededException ex =
                    new MaxUploadSizeExceededException(100 * 1024 * 1024);

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleMaxUploadSize(ex, request);

            assertAll(
                    "Extract File Too Large Response",
                    () -> assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, response.getStatusCode()),
                    () -> assertNotNull(response.getBody()),
                    () ->
                            assertEquals(
                                    "/api/v1/extract",
                                    response.getBody().getProperties().get("path")));
        }

        @Test
        @DisplayName("POST /api/v1/watermark should return 404 for invalid endpoint")
        void testWatermarkInvalidEndpoint() {

            when(request.getRequestURI()).thenReturn("/api/v1/watermark-invalid");
            NoHandlerFoundException ex =
                    new NoHandlerFoundException(
                            "POST",
                            "/api/v1/watermark-invalid",
                            new org.springframework.http.HttpHeaders());

            ResponseEntity<ProblemDetail> response = exceptionHandler.handleNotFound(ex, request);

            assertAll(
                    "Watermark Invalid Endpoint Response",
                    () -> assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode()),
                    () -> assertNotNull(response.getBody()),
                    () ->
                            assertEquals(
                                    "/api/v1/watermark-invalid",
                                    response.getBody().getProperties().get("path")));
        }
    }

    @Nested
    @DisplayName("Response Format Validation")
    class EnhancedValidationTests {

        @Test
        @DisplayName("Returns application/problem+json Content-Type")
        void testContentTypeIsApplicationProblemJson() {
            when(request.getRequestURI()).thenReturn("/api/v1/test");
            IllegalArgumentException ex = new IllegalArgumentException("Test error");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleIllegalArgument(ex, request);

            assertEquals(
                    MediaType.APPLICATION_PROBLEM_JSON, response.getHeaders().getContentType());
        }

        @Test
        @DisplayName("Hints are meaningful and properly structured")
        void testHintsAreMeaningful() {
            when(request.getRequestURI()).thenReturn("/api/v1/test");
            IllegalArgumentException ex = new IllegalArgumentException("Invalid argument");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleIllegalArgument(ex, request);

            assertHasMinimalHints(response.getBody(), MIN_HINTS_DETAILED);
        }

        @Test
        @DisplayName("Timestamp present in all responses")
        void testTimestampIsAlwaysPresent() {
            when(request.getRequestURI()).thenReturn("/api/v1/test");
            IOException ex = new IOException("Test IO error");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleIOException(ex, request);

            Object timestamp = response.getBody().getProperties().get("timestamp");
            assertAll(
                    () -> assertNotNull(timestamp),
                    () -> {
                        Instant parsed;
                        if (timestamp instanceof String tsString) {
                            parsed = Instant.parse(tsString);
                        } else {
                            assertInstanceOf(Instant.class, timestamp);
                            parsed = (Instant) timestamp;
                        }
                        Instant now = Instant.now();
                        assertTrue(
                                !parsed.isBefore(now.minusSeconds(60))
                                        && !parsed.isAfter(now.plusSeconds(5)),
                                "timestamp should be recent and in ISO-8601 format");
                    });
        }

        @Test
        @DisplayName("ActionRequired present in all responses")
        void testActionRequiredIsAlwaysPresent() {
            when(request.getRequestURI()).thenReturn("/api/v1/test");
            Exception ex = new RuntimeException("Generic error");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleGenericException(ex, request);

            Object actionRequired = response.getBody().getProperties().get("actionRequired");
            assertAll(
                    () -> assertNotNull(actionRequired),
                    () -> assertInstanceOf(String.class, actionRequired),
                    () -> assertTrue(((String) actionRequired).length() > 10));
        }

        @Test
        @DisplayName("Error code present for validation exceptions")
        void testErrorCodePresentForValidationExceptions() {
            when(request.getRequestURI()).thenReturn("/api/v1/convert/cbr/pdf");
            CbrFormatException ex = ExceptionUtils.createCbrInvalidFormatException("Invalid CBR");

            ResponseEntity<ProblemDetail> response = exceptionHandler.handleValidation(ex, request);

            Object errorCode = response.getBody().getProperties().get("errorCode");
            assertAll(
                    () -> assertNotNull(errorCode),
                    () -> assertInstanceOf(String.class, errorCode),
                    () -> assertFalse(((String) errorCode).isEmpty()));
        }
    }

    @Nested
    @DisplayName("Edge Cases")
    class EdgeCaseTests {

        @Test
        @DisplayName("Null exception message handled")
        void testHandleExceptionWithNullMessage() {
            when(request.getRequestURI()).thenReturn("/api/v1/test");
            IllegalArgumentException ex = new IllegalArgumentException((String) null);

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleIllegalArgument(ex, request);

            assertStandardErrorStructure(response, HttpStatus.BAD_REQUEST);
        }

        @Test
        @DisplayName("Empty exception message handled")
        void testHandleExceptionWithEmptyMessage() {
            when(request.getRequestURI()).thenReturn("/api/v1/test");
            IllegalArgumentException ex = new IllegalArgumentException("");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleIllegalArgument(ex, request);

            assertAll(
                    () -> assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode()),
                    () -> assertNotNull(response.getBody().getDetail()));
        }

        @Test
        @DisplayName("Very long exception message handled")
        void testHandleExceptionWithVeryLongMessage() {
            when(request.getRequestURI()).thenReturn("/api/v1/test");
            String longMessage = "A".repeat(1000);
            IllegalArgumentException ex = new IllegalArgumentException(longMessage);

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleIllegalArgument(ex, request);

            assertStandardErrorStructure(response, HttpStatus.BAD_REQUEST);
        }

        @Test
        @DisplayName("Nested exceptions handled")
        void testHandleNestedExceptions() {
            when(request.getRequestURI()).thenReturn("/api/v1/test");
            IOException rootCause = new IOException("Root cause");
            RuntimeException wrapper = new RuntimeException("Wrapper", rootCause);

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleGenericException(wrapper, request);

            assertStandardErrorStructure(response, HttpStatus.INTERNAL_SERVER_ERROR);
        }

        @Test
        @DisplayName("Null request URI handled")
        void testHandleExceptionWithNullRequestUri() {
            when(request.getRequestURI()).thenReturn(null);
            IllegalArgumentException ex = new IllegalArgumentException("Test error");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleIllegalArgument(ex, request);

            assertAll(
                    () -> assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode()),
                    () -> {
                        Object path = response.getBody().getProperties().get("path");
                        assertTrue(
                                path == null
                                        || (path instanceof String && ((String) path).length() == 0)
                                        || "unknown".equals(path),
                                "Path should be null/empty/unknown when request URI is missing");
                    });
        }

        @Test
        @DisplayName("MessageSource failure propagates exception")
        void testMessageSourceFailurePropagates() {
            when(request.getRequestURI()).thenReturn("/api/v1/test");
            // Simulate MessageSource throwing an exception
            when(messageSource.getMessage(anyString(), isNull(), anyString(), any()))
                    .thenThrow(new RuntimeException("MessageSource error"));

            org.springframework.security.access.AccessDeniedException ex =
                    new org.springframework.security.access.AccessDeniedException("test");

            // Should propagate the MessageSource exception
            assertThrows(
                    RuntimeException.class, () -> exceptionHandler.handleAccessDenied(ex, request));
        }
    }

    @Nested
    @DisplayName("RFC 7807 Compliance")
    class Rfc7807ComplianceTests {

        @Test
        @DisplayName("All mandatory fields present")
        void testRfc7807Compliance() {
            when(request.getRequestURI()).thenReturn("/api/v1/admin/settings");
            org.springframework.security.access.AccessDeniedException ex =
                    new org.springframework.security.access.AccessDeniedException(
                            "Access is denied");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleAccessDenied(ex, request);

            assertRfc7807Compliant(response.getBody(), HttpStatus.FORBIDDEN);
        }

        @Test
        @DisplayName("Type field uses /errors/ URI format")
        void testTypeFieldUsesProperUriFormat() {
            when(request.getRequestURI()).thenReturn("/api/v1/test");
            IllegalArgumentException ex = new IllegalArgumentException("Test");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleIllegalArgument(ex, request);

            URI type = response.getBody().getType();
            assertTrue(type.toString().startsWith("/errors/"));
        }

        @Test
        @DisplayName("Path property present for request tracking")
        void testInstanceFieldIsPresent() {
            when(request.getRequestURI()).thenReturn("/api/v1/test");
            IllegalArgumentException ex = new IllegalArgumentException("Test");

            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleIllegalArgument(ex, request);

            assertNotNull(response.getBody().getProperties().get("path"));
        }
    }

    @Nested
    @DisplayName("Custom Properties Consistency")
    class CustomPropertiesTests {

        @Test
        @DisplayName("All error responses include standard custom properties")
        void testStandardCustomProperties() {
            // Test with different exception types to ensure consistency
            List<ResponseEntity<ProblemDetail>> responses =
                    List.of(
                            exceptionHandler.handleAccessDenied(
                                    new org.springframework.security.access.AccessDeniedException(
                                            "Test"),
                                    request),
                            exceptionHandler.handleIllegalArgument(
                                    new IllegalArgumentException("Test"), request),
                            exceptionHandler.handleIOException(new IOException("Test"), request));

            responses.forEach(
                    response -> {
                        java.util.Map<String, Object> props = response.getBody().getProperties();
                        assertAll(
                                "Standard custom properties",
                                () ->
                                        assertTrue(
                                                props.containsKey("timestamp"),
                                                "timestamp should be present"),
                                () ->
                                        assertTrue(
                                                props.containsKey("path"),
                                                "path should be present"),
                                () ->
                                        assertTrue(
                                                props.containsKey("title"),
                                                "title should be present (serialization)"));
                    });
        }

        @Test
        @DisplayName("Validation exceptions include errorCode")
        void testValidationExceptionsIncludeErrorCode() {
            BaseValidationException ex = ExceptionUtils.createCbrInvalidFormatException("Test");

            ResponseEntity<ProblemDetail> response = exceptionHandler.handleValidation(ex, request);

            assertTrue(response.getBody().getProperties().containsKey("errorCode"));
        }

        @Test
        @DisplayName("Error codes follow expected format")
        void testErrorCodeFormat() {
            when(request.getRequestURI()).thenReturn("/api/v1/convert/cbr/pdf");
            CbrFormatException ex = ExceptionUtils.createCbrInvalidFormatException("Invalid CBR");

            ResponseEntity<ProblemDetail> response = exceptionHandler.handleValidation(ex, request);

            Object errorCode = response.getBody().getProperties().get("errorCode");
            assertAll(
                    () -> assertNotNull(errorCode),
                    () -> assertInstanceOf(String.class, errorCode),
                    () -> assertFalse(((String) errorCode).isEmpty()));
        }

        @Test
        @DisplayName("MessageSource localization works correctly")
        void testMessageSourceLocalization() {
            // Set up MessageSource to return expected values
            when(messageSource.getMessage(
                            eq("error.accessDenied.detail"),
                            isNull(),
                            eq(
                                    "Access to this resource is forbidden. You do not have the required permissions."),
                            any()))
                    .thenReturn(
                            "Access to this resource is forbidden. You do not have the required permissions.");
            when(messageSource.getMessage(
                            eq("error.accessDenied.title"), isNull(), eq("Access Denied"), any()))
                    .thenReturn("Access Denied");

            org.springframework.security.access.AccessDeniedException ex =
                    new org.springframework.security.access.AccessDeniedException("test");
            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleAccessDenied(ex, request);

            assertEquals("Access Denied", response.getBody().getTitle());
            assertTrue(response.getBody().getDetail().contains("forbidden"));
        }

        @Test
        @DisplayName("Development environment includes debug information")
        void testDevEnvironmentIncludesDebugInfo() {
            when(environment.getActiveProfiles()).thenReturn(new String[] {"dev"});
            when(request.getRequestURI()).thenReturn("/api/v1/test");

            Exception ex = new RuntimeException("test error");
            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleGenericException(ex, request);
            assertTrue(response.getBody().getProperties().containsKey("debugMessage"));
            assertEquals("test error", response.getBody().getProperties().get("debugMessage"));
        }

        @Test
        @DisplayName("Production environment hides debug information")
        void testProdEnvironmentHidesDebugInfo() {
            when(environment.getActiveProfiles()).thenReturn(new String[] {"prod"});
            when(request.getRequestURI()).thenReturn("/api/v1/test");

            Exception ex = new RuntimeException("test error");
            ResponseEntity<ProblemDetail> response =
                    exceptionHandler.handleGenericException(ex, request);

            assertFalse(response.getBody().getProperties().containsKey("debugMessage"));
        }
    }
}
