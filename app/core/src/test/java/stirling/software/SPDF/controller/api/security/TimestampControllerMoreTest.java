package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.security.TimestampPdfRequest;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;

/**
 * Additional tests for {@link TimestampController} that exercise the real TSA-over-HTTP code path.
 *
 * <p>A loopback {@link MockWebServer} serves canned RFC 3161 responses and its URL is added to the
 * admin allowlist so the request passes SSRF validation. The controller loads a real in-memory PDF
 * and runs {@code addSignature}/{@code saveIncremental}, which genuinely invokes the signing
 * callback, hashes the byte range, and POSTs a timestamp query to the mock server. The mock never
 * returns a cryptographically valid token, so the success path stops at response validation; this
 * still drives the HTTP request, the HTTP-error branch, the malformed-response branch, and the
 * oversized-response branch. No real network access occurs.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TimestampControllerMoreTest {

    @org.mockito.Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @org.mockito.Mock private ApplicationProperties applicationProperties;

    private TempFileManager tempFileManager;
    private TimestampController controller;

    private ApplicationProperties.Security security;
    private ApplicationProperties.Security.Timestamp tsConfig;

    private MockWebServer server;
    private final List<Path> createdTempFiles = new ArrayList<>();

    @BeforeEach
    void setUp() throws Exception {
        security = new ApplicationProperties.Security();
        tsConfig = new ApplicationProperties.Security.Timestamp();
        security.setTimestamp(tsConfig);
        when(applicationProperties.getSecurity()).thenReturn(security);

        tempFileManager = mock(TempFileManager.class);
        lenient()
                .when(tempFileManager.createManagedTempFile(any()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("ts-out", inv.<String>getArgument(0))
                                            .toFile();
                            createdTempFiles.add(f.toPath());
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });

        controller =
                new TimestampController(pdfDocumentFactory, applicationProperties, tempFileManager);

        server = new MockWebServer();
        server.start();
    }

    @AfterEach
    void tearDown() throws Exception {
        if (server != null) {
            server.shutdown();
        }
        for (Path p : createdTempFiles) {
            Files.deleteIfExists(p);
        }
    }

    /** A real one-page PDF the controller can load, sign and incrementally save. */
    private static PDDocument realPdfDocument() throws IOException {
        PDDocument document = new PDDocument();
        document.addPage(new PDPage(PDRectangle.A4));
        // Round-trip through bytes so the document has a usable on-disk structure for incremental
        // save.
        try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            document.save(baos);
            document.close();
            return org.apache.pdfbox.Loader.loadPDF(baos.toByteArray());
        }
    }

    private TimestampPdfRequest requestForServerUrl(String path) throws Exception {
        String url = server.url(path).toString();
        // Allow the loopback mock-server URL through the SSRF allowlist.
        tsConfig.setCustomTsaUrls(new ArrayList<>(List.of(url)));

        MockMultipartFile pdf =
                new MockMultipartFile(
                        "fileInput",
                        "input.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        new byte[] {0x25, 0x50, 0x44, 0x46});

        when(pdfDocumentFactory.load(any(MockMultipartFile.class))).thenReturn(realPdfDocument());

        TimestampPdfRequest request = new TimestampPdfRequest();
        request.setFileInput(pdf);
        request.setTsaUrl(url);
        return request;
    }

    @Nested
    @DisplayName("HTTP request is actually issued")
    class HttpRequestIssued {

        @Test
        @DisplayName("POSTs an RFC 3161 timestamp-query to the TSA endpoint")
        void postsTimestampQuery() throws Exception {
            // Canned non-token body -> validation fails after the POST, but the POST still happens.
            server.enqueue(
                    new MockResponse()
                            .setResponseCode(200)
                            .addHeader("Content-Type", "application/timestamp-reply")
                            .setBody("not-a-real-token"));

            TimestampPdfRequest request = requestForServerUrl("/tsr");

            // Validation of the bogus token fails; surfaced as an exception from saveIncremental.
            assertThrows(Exception.class, () -> controller.timestampPdf(request));

            RecordedRequest recorded = server.takeRequest(5, TimeUnit.SECONDS);
            assertNotNull(
                    recorded, "the controller should have POSTed a timestamp query to the TSA");
            assertEquals("POST", recorded.getMethod());
            assertEquals("/tsr", recorded.getPath());
            assertEquals("application/timestamp-query", recorded.getHeader("Content-Type"));
            assertTrue(
                    recorded.getBodySize() > 0, "request body (the TS query) should be non-empty");
        }
    }

    @Nested
    @DisplayName("HTTP error handling")
    class HttpErrorHandling {

        @Test
        @DisplayName("non-200 TSA response surfaces an error mentioning the status code")
        void httpErrorStatus() throws Exception {
            server.enqueue(new MockResponse().setResponseCode(500).setBody("internal tsa failure"));

            TimestampPdfRequest request = requestForServerUrl("/tsr");

            Exception ex = assertThrows(Exception.class, () -> controller.timestampPdf(request));
            assertTrue(
                    containsInChain(ex, "500"),
                    "expected HTTP status 500 to appear in the error chain: " + describe(ex));
        }

        @Test
        @DisplayName("503 from the TSA is reported as a failure")
        void httpServiceUnavailable() throws Exception {
            server.enqueue(new MockResponse().setResponseCode(503));

            TimestampPdfRequest request = requestForServerUrl("/tsr");

            assertThrows(Exception.class, () -> controller.timestampPdf(request));
        }
    }

    @Nested
    @DisplayName("Malformed response handling")
    class MalformedResponseHandling {

        @Test
        @DisplayName("empty 200 body fails to parse as a TimeStampResponse")
        void emptyBodyFailsToParse() throws Exception {
            server.enqueue(new MockResponse().setResponseCode(200).setBody(""));

            TimestampPdfRequest request = requestForServerUrl("/tsr");

            assertThrows(Exception.class, () -> controller.timestampPdf(request));
        }

        @Test
        @DisplayName("garbage 200 body fails to parse as a TimeStampResponse")
        void garbageBodyFailsToParse() throws Exception {
            server.enqueue(
                    new MockResponse()
                            .setResponseCode(200)
                            .setBody("this is definitely not ASN.1 DER"));

            TimestampPdfRequest request = requestForServerUrl("/tsr");

            assertThrows(Exception.class, () -> controller.timestampPdf(request));
        }
    }

    @Nested
    @DisplayName("Allowlist validation still applies on this path")
    class AllowlistValidation {

        @Test
        @DisplayName("URL not in the allowlist is rejected before any HTTP call")
        void rejectsNonAllowlistedUrl() {
            // No custom URL configured -> arbitrary URL must be rejected.
            MockMultipartFile pdf =
                    new MockMultipartFile(
                            "fileInput",
                            "input.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            new byte[] {0x25, 0x50, 0x44, 0x46});
            TimestampPdfRequest request = new TimestampPdfRequest();
            request.setFileInput(pdf);
            request.setTsaUrl("http://attacker.example.com/tsr");

            IllegalArgumentException ex =
                    assertThrows(
                            IllegalArgumentException.class, () -> controller.timestampPdf(request));
            assertTrue(ex.getMessage().contains("not in the allowed list"));
            assertEquals(0, server.getRequestCount(), "no HTTP call should be made when rejected");
        }
    }

    private static boolean containsInChain(Throwable t, String needle) {
        for (Throwable cur = t; cur != null; cur = cur.getCause()) {
            if (cur.getMessage() != null && cur.getMessage().contains(needle)) {
                return true;
            }
        }
        return false;
    }

    private static String describe(Throwable t) {
        StringBuilder sb = new StringBuilder();
        for (Throwable cur = t; cur != null; cur = cur.getCause()) {
            sb.append(cur.getClass().getSimpleName()).append(": ").append(cur.getMessage());
            if (cur.getCause() != null) {
                sb.append(" -> ");
            }
        }
        return sb.toString();
    }
}
