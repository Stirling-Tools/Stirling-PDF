package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.File;
import java.lang.reflect.Method;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.MockitoAnnotations;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import stirling.software.SPDF.model.api.converters.UrlToPdfRequest;
import stirling.software.SPDF.service.OfficeToPdfService;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.officeconvert.topdf.OfficeToPdf;
import stirling.software.officeconvert.topdf.WebAssets;

public class ConvertWebsiteToPdfTest {
    private static ResponseEntity<Resource> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(new ByteArrayResource(bytes));
    }

    private static byte[] drainBody(ResponseEntity<Resource> response) throws java.io.IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        try (java.io.InputStream __in = response.getBody().getInputStream()) {
            __in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    private static final Pattern PDF_FILENAME_PATTERN = Pattern.compile("[A-Za-z0-9_]+\\.pdf");
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private OfficeToPdfService officeToPdfService;
    @Mock private TempFileManager tempFileManager;

    private ApplicationProperties applicationProperties;
    private ConvertWebsiteToPDF sut;
    private AutoCloseable mocks;

    @BeforeEach
    void setUp() throws Exception {
        mocks = MockitoAnnotations.openMocks(this);
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("test", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });

        // Enable feature (adjust structure for your project if necessary)
        applicationProperties = new ApplicationProperties();
        applicationProperties.getSystem().setEnableUrlToPDF(true);

        // Stubs in case the code continues to run
        when(officeToPdfService.options()).thenReturn(OfficeToPdf.Options.defaults());
        when(pdfDocumentFactory.load(any(File.class))).thenReturn(new PDDocument());

        // Build SUT
        sut =
                new ConvertWebsiteToPDF(
                        pdfDocumentFactory,
                        officeToPdfService,
                        applicationProperties,
                        tempFileManager);

        // Provide RequestContext for ServletUriComponentsBuilder
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setScheme("http");
        req.setServerName("localhost");
        req.setServerPort(8080);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));
    }

    @AfterEach
    void tearDown() throws Exception {
        RequestContextHolder.resetRequestAttributes();
        if (mocks != null) mocks.close();
    }

    @Test
    void redirect_with_error_when_invalid_url_format_provided() throws Exception {
        UrlToPdfRequest request = new UrlToPdfRequest();
        request.setUrlInput("not-a-url");

        ResponseEntity<?> resp = sut.urlToPdf(request);

        assertEquals(HttpStatus.SEE_OTHER, resp.getStatusCode());
        URI location = resp.getHeaders().getLocation();
        assertNotNull(location, "Location header expected");
        assertTrue(
                location.getQuery() != null
                        && location.getQuery().contains("error=error.invalidUrlFormat"));
    }

    @Test
    void redirect_with_error_when_url_is_not_reachable() throws Exception {
        UrlToPdfRequest request = new UrlToPdfRequest();
        // .invalid is reserved by RFC and not resolvable
        request.setUrlInput("https://nonexistent.invalid/");

        ResponseEntity<?> resp = sut.urlToPdf(request);

        assertEquals(HttpStatus.SEE_OTHER, resp.getStatusCode());
        URI location = resp.getHeaders().getLocation();
        assertNotNull(location, "Location header expected");
        assertTrue(
                location.getQuery() != null
                        && location.getQuery().contains("error=error.urlNotReachable"));
    }

    @Test
    void redirect_with_error_when_endpoint_disabled() throws Exception {
        // Disable feature
        applicationProperties.getSystem().setEnableUrlToPDF(false);

        UrlToPdfRequest request = new UrlToPdfRequest();
        request.setUrlInput("https://example.com/");

        ResponseEntity<?> resp = sut.urlToPdf(request);

        assertEquals(HttpStatus.SEE_OTHER, resp.getStatusCode());
        URI location = resp.getHeaders().getLocation();
        assertNotNull(location, "Location header expected");
        assertTrue(
                location.getQuery() != null
                        && location.getQuery().contains("error=error.endpointDisabled"));
    }

    @Test
    void convertURLToFileName_sanitizes_and_appends_pdf() throws Exception {
        Method m =
                ConvertWebsiteToPDF.class.getDeclaredMethod("convertURLToFileName", String.class);
        m.setAccessible(true);

        String in = "https://ex-ample.com/path?q=1&x=y#frag";
        String out = (String) m.invoke(sut, in);

        assertTrue(out.endsWith(".pdf"));
        // Only A–Z, a–z, 0–9, underscore and dot allowed
        assertTrue(PDF_FILENAME_PATTERN.matcher(out).matches());
        // no truncation here (source not that long)
        assertTrue(out.length() <= 54);
    }

    @Test
    void convertURLToFileName_truncates_to_50_chars_before_pdf_suffix() throws Exception {
        Method m =
                ConvertWebsiteToPDF.class.getDeclaredMethod("convertURLToFileName", String.class);
        m.setAccessible(true);

        // Very long URL -> triggers truncation
        String longUrl =
                "https://very-very-long-domain.example.com/some/really/long/path/with?many=params&and=chars";
        String out = (String) m.invoke(sut, longUrl);

        assertTrue(out.endsWith(".pdf"));
        assertTrue(PDF_FILENAME_PATTERN.matcher(out).matches());
        // safeName limited to 50 -> total max 54 including '.pdf'
        assertTrue(out.length() <= 54, "Filename should be truncated to 50 + '.pdf'");
    }

    private static MockedStatic<WebAssets> fetchReturning(String html) {
        WebAssets assets = mock(WebAssets.class);
        when(assets.page()).thenReturn(html.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        MockedStatic<WebAssets> fetch = Mockito.mockStatic(WebAssets.class);
        fetch.when(() -> WebAssets.fetch(anyString(), any(WebAssets.Access.class)))
                .thenReturn(assets);
        return fetch;
    }

    @Test
    void happy_path_converts_the_fetched_page_and_cleans_up() throws Exception {
        UrlToPdfRequest request = new UrlToPdfRequest();
        request.setUrlInput("https://example.com");
        Path[] html = new Path[1];
        OfficeToPdf.Options[] options = new OfficeToPdf.Options[1];
        Mockito.doAnswer(
                        inv -> {
                            html[0] = inv.getArgument(0);
                            options[0] = inv.getArgument(2);
                            assertTrue(Files.exists(html[0]));
                            return null;
                        })
                .when(officeToPdfService)
                .convert(any(Path.class), any(Path.class), any(OfficeToPdf.Options.class));

        try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<WebAssets> fetch = fetchReturning("<html></html>")) {
            gu.when(() -> GeneralUtils.isValidURL("https://example.com")).thenReturn(true);
            gu.when(() -> GeneralUtils.isURLReachable("https://example.com")).thenReturn(true);
            gu.when(() -> GeneralUtils.convertToFileName(anyString())).thenReturn("example_com");
            gu.when(() -> GeneralUtils.generateFilename(anyString(), anyString()))
                    .thenAnswer(inv -> inv.<String>getArgument(0) + inv.<String>getArgument(1));

            ResponseEntity<?> resp = sut.urlToPdf(request);

            assertEquals(HttpStatus.OK, resp.getStatusCode());
            fetch.verify(
                    () ->
                            WebAssets.fetch(
                                    Mockito.eq("https://example.com"),
                                    Mockito.argThat(
                                            access ->
                                                    access.network()
                                                            && access.redirects()
                                                            && !access.privateAddresses())));
            assertNotNull(html[0]);
            assertTrue(
                    Mockito.mockingDetails(options[0].htmlAssets()).isMock(),
                    "Linked assets must resolve against the fetched page");
            assertFalse(Files.exists(html[0]), "Temp HTML file should be deleted after the call");
        }
    }

    @Test
    void a_failed_temp_file_delete_does_not_fail_the_conversion() throws Exception {
        UrlToPdfRequest request = new UrlToPdfRequest();
        request.setUrlInput("https://example.com");

        try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<WebAssets> fetch = fetchReturning("<html></html>");
                MockedStatic<Files> files =
                        Mockito.mockStatic(Files.class, Mockito.CALLS_REAL_METHODS)) {
            gu.when(() -> GeneralUtils.isValidURL("https://example.com")).thenReturn(true);
            gu.when(() -> GeneralUtils.isURLReachable("https://example.com")).thenReturn(true);
            gu.when(() -> GeneralUtils.convertToFileName(anyString())).thenReturn("example_com");
            gu.when(() -> GeneralUtils.generateFilename(anyString(), anyString()))
                    .thenAnswer(inv -> inv.<String>getArgument(0) + inv.<String>getArgument(1));
            files.when(
                            () ->
                                    Files.deleteIfExists(
                                            Mockito.argThat(
                                                    (Path path) ->
                                                            path != null
                                                                    && path.getFileName()
                                                                            .toString()
                                                                            .startsWith(
                                                                                    "output_"))))
                    .thenThrow(new java.io.IOException("fail delete"));

            ResponseEntity<?> resp = sut.urlToPdf(request);

            assertEquals(HttpStatus.OK, resp.getStatusCode());
        }
    }

    @Test
    void redirect_with_error_when_disallowed_content_detected() throws Exception {
        UrlToPdfRequest request = new UrlToPdfRequest();
        request.setUrlInput("https://example.com");

        try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<WebAssets> fetch =
                        fetchReturning("<link rel=\"attachment\" href=\"file:///etc/passwd\">")) {
            gu.when(() -> GeneralUtils.isValidURL("https://example.com")).thenReturn(true);
            gu.when(() -> GeneralUtils.isURLReachable("https://example.com")).thenReturn(true);

            ResponseEntity<?> resp = sut.urlToPdf(request);

            assertEquals(HttpStatus.SEE_OTHER, resp.getStatusCode());
            URI location = resp.getHeaders().getLocation();
            assertNotNull(location, "Location header expected");
            assertTrue(
                    location.getQuery() != null
                            && location.getQuery().contains("error=error.disallowedUrlContent"));
            Mockito.verifyNoInteractions(officeToPdfService);
        }
    }
}
