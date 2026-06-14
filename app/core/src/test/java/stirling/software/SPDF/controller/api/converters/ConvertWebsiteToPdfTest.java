package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.Method;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.MockitoAnnotations;

import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriBuilder;
import jakarta.ws.rs.core.UriInfo;

import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.ProcessExecutor.Processes;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

// Migration: the endpoint now returns jakarta.ws.rs.core.Response (not Spring ResponseEntity) and
// builds redirect URIs from an injected @Context UriInfo (not ServletUriComponentsBuilder /
// RequestContextHolder). urlToPdf's signature changed from (UrlToPdfRequest) to (String urlInput,
// UriInfo uriInfo); we drive it with the raw url string and a UriInfo whose getBaseUriBuilder()
// yields a fresh builder rooted at http://localhost:8080/.
public class ConvertWebsiteToPdfTest {

    private static final Pattern PDF_FILENAME_PATTERN = Pattern.compile("[A-Za-z0-9_]+\\.pdf");
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private RuntimePathConfig runtimePathConfig;
    @Mock private TempFileManager tempFileManager;
    @Mock private UriInfo uriInfo;

    private ApplicationProperties applicationProperties;
    private ConvertWebsiteToPDF sut;
    private AutoCloseable mocks;

    private Response urlToPdf(String urlInput) throws Exception {
        return sut.urlToPdf(urlInput, uriInfo);
    }

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
        lenient().when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/usr/bin/weasyprint");
        lenient().when(pdfDocumentFactory.load(any(File.class))).thenReturn(new PDDocument());

        // Build SUT
        sut =
                new ConvertWebsiteToPDF(
                        pdfDocumentFactory,
                        runtimePathConfig,
                        applicationProperties,
                        tempFileManager);

        // UriInfo.getBaseUriBuilder() backs the redirect-URI construction; hand out a fresh builder
        // each call so the production .replacePath(...).clone().queryParam(...) chain is isolated.
        lenient()
                .when(uriInfo.getBaseUriBuilder())
                .thenAnswer(inv -> UriBuilder.fromUri("http://localhost:8080/"));
    }

    @AfterEach
    void tearDown() throws Exception {
        if (mocks != null) mocks.close();
    }

    @Test
    void redirect_with_error_when_invalid_url_format_provided() throws Exception {
        Response resp = urlToPdf("not-a-url");

        assertEquals(Response.Status.SEE_OTHER.getStatusCode(), resp.getStatus());
        URI location = resp.getLocation();
        assertNotNull(location, "Location header expected");
        assertTrue(
                location.getQuery() != null
                        && location.getQuery().contains("error=error.invalidUrlFormat"));
    }

    @Test
    void redirect_with_error_when_url_is_not_reachable() throws Exception {
        // .invalid is reserved by RFC and not resolvable
        Response resp = urlToPdf("https://nonexistent.invalid/");

        assertEquals(Response.Status.SEE_OTHER.getStatusCode(), resp.getStatus());
        URI location = resp.getLocation();
        assertNotNull(location, "Location header expected");
        assertTrue(
                location.getQuery() != null
                        && location.getQuery().contains("error=error.urlNotReachable"));
    }

    @Test
    void redirect_with_error_when_endpoint_disabled() throws Exception {
        // Disable feature
        applicationProperties.getSystem().setEnableUrlToPDF(false);

        Response resp = urlToPdf("https://example.com/");

        assertEquals(Response.Status.SEE_OTHER.getStatusCode(), resp.getStatus());
        URI location = resp.getLocation();
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

    @Test
    void happy_path_executes_weasyprint_loads_pdf_and_returns_response() throws Exception {
        try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class);
                MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<HttpClient> httpClient = mockHttpClientReturning("<html></html>")) {

            gu.when(() -> GeneralUtils.isValidURL("https://example.com")).thenReturn(true);
            gu.when(() -> GeneralUtils.isURLReachable("https://example.com")).thenReturn(true);
            gu.when(() -> GeneralUtils.convertToFileName(anyString())).thenReturn("example_com");
            gu.when(() -> GeneralUtils.generateFilename(anyString(), anyString()))
                    .thenAnswer(inv -> inv.<String>getArgument(0) + inv.<String>getArgument(1));

            ProcessExecutor mockExec = Mockito.mock(ProcessExecutor.class);
            pe.when(() -> ProcessExecutor.getInstance(Processes.WEASYPRINT)).thenReturn(mockExec);

            @SuppressWarnings("unchecked")
            ArgumentCaptor<List<String>> cmdCaptor = ArgumentCaptor.forClass(List.class);

            ProcessExecutorResult dummyResult = Mockito.mock(ProcessExecutorResult.class);
            when(mockExec.runCommandWithOutputHandling(cmdCaptor.capture()))
                    .thenReturn(dummyResult);

            Response resp = urlToPdf("https://example.com");

            // Assert
            assertNotNull(resp);
            assertEquals(Response.Status.OK.getStatusCode(), resp.getStatus());

            // Assert – WeasyPrint command correct
            List<String> cmd = cmdCaptor.getValue();
            assertNotNull(cmd);
            assertEquals("/usr/bin/weasyprint", cmd.get(0));
            assertTrue(cmd.size() >= 6, "WeasyPrint should receive HTML input and output path");
            String htmlPathStr = cmd.get(1);
            assertEquals("--base-url", cmd.get(2));
            assertEquals("https://example.com", cmd.get(3));
            assertEquals("--pdf-forms", cmd.get(4));
            String outPathStr = cmd.get(5);
            assertNotNull(outPathStr);

            // Temp file must be deleted in finally
            assertFalse(
                    Files.exists(Path.of(htmlPathStr)),
                    "Temp HTML file should be deleted after the call");
        }
    }

    @Test
    void finally_block_logs_and_swallows_ioexception_on_delete() throws Exception {
        // Arrange
        Path preCreatedTemp = Files.createTempFile("test_output_", ".pdf");
        Path htmlTemp = Files.createTempFile("test_input_", ".html");

        try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class);
                MockedStatic<Files> files = Mockito.mockStatic(Files.class);
                MockedStatic<HttpClient> httpClient = mockHttpClientReturning("<html></html>")) {

            gu.when(() -> GeneralUtils.isValidURL("https://example.com")).thenReturn(true);
            gu.when(() -> GeneralUtils.isURLReachable("https://example.com")).thenReturn(true);
            gu.when(() -> GeneralUtils.convertToFileName(anyString())).thenReturn("example_com");
            gu.when(() -> GeneralUtils.generateFilename(anyString(), anyString()))
                    .thenAnswer(inv -> inv.<String>getArgument(0) + inv.<String>getArgument(1));

            files.when(() -> Files.createTempFile("url_input_", ".html")).thenReturn(htmlTemp);
            files.when(() -> Files.createTempFile("output_", ".pdf")).thenReturn(preCreatedTemp);
            files.when(() -> Files.createTempFile(eq("test"), anyString()))
                    .thenReturn(preCreatedTemp);
            files.when(
                            () ->
                                    Files.writeString(
                                            eq(htmlTemp),
                                            anyString(),
                                            eq(java.nio.charset.StandardCharsets.UTF_8)))
                    .thenReturn(htmlTemp);
            files.when(() -> Files.deleteIfExists(htmlTemp)).thenReturn(true);
            files.when(() -> Files.deleteIfExists(preCreatedTemp))
                    .thenThrow(new IOException("fail delete"));
            files.when(() -> Files.exists(preCreatedTemp)).thenReturn(true);
            files.when(() -> Files.size(any(Path.class))).thenReturn(100L);
            files.when(() -> Files.copy(any(Path.class), any(java.io.OutputStream.class)))
                    .thenReturn(0L);
            files.when(() -> Files.newOutputStream(any(Path.class)))
                    .thenAnswer(inv -> new java.io.ByteArrayOutputStream());

            ProcessExecutor mockExec = Mockito.mock(ProcessExecutor.class);
            pe.when(() -> ProcessExecutor.getInstance(Processes.WEASYPRINT)).thenReturn(mockExec);
            ProcessExecutorResult dummy = Mockito.mock(ProcessExecutorResult.class);
            when(mockExec.runCommandWithOutputHandling(Mockito.<List>any())).thenReturn(dummy);

            Response resp = assertDoesNotThrow(() -> urlToPdf("https://example.com"));

            assertNotNull(resp, "Response should not be null");
            assertEquals(Response.Status.OK.getStatusCode(), resp.getStatus());
            assertTrue(
                    Files.exists(preCreatedTemp),
                    "Temp file should still exist despite delete IOException");
        } finally {
            try {
                Files.deleteIfExists(preCreatedTemp);
                Files.deleteIfExists(htmlTemp);
            } catch (IOException ignore) {
            }
        }
    }

    private static MockedStatic<HttpClient> mockHttpClientReturning(String body) throws Exception {
        MockedStatic<HttpClient> httpClientStatic = Mockito.mockStatic(HttpClient.class);
        HttpClient.Builder builder = Mockito.mock(HttpClient.Builder.class);
        HttpClient client = Mockito.mock(HttpClient.class);
        HttpResponse<String> response = Mockito.mock();

        httpClientStatic.when(HttpClient::newBuilder).thenReturn(builder);
        when(builder.followRedirects(HttpClient.Redirect.NEVER)).thenReturn(builder);
        when(builder.connectTimeout(any(Duration.class))).thenReturn(builder);
        when(builder.build()).thenReturn(client);

        Mockito.doReturn(response).when(client).send(any(HttpRequest.class), any());
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn(body);

        return httpClientStatic;
    }

    @Test
    void redirect_with_error_when_disallowed_content_detected() throws Exception {
        try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<HttpClient> httpClient =
                        mockHttpClientReturning(
                                "<link rel=\"attachment\" href=\"file:///etc/passwd\">")) {

            gu.when(() -> GeneralUtils.isValidURL("https://example.com")).thenReturn(true);
            gu.when(() -> GeneralUtils.isURLReachable("https://example.com")).thenReturn(true);

            Response resp = urlToPdf("https://example.com");

            assertEquals(Response.Status.SEE_OTHER.getStatusCode(), resp.getStatus());
            URI location = resp.getLocation();
            assertNotNull(location, "Location header expected");
            assertTrue(
                    location.getQuery() != null
                            && location.getQuery().contains("error=error.disallowedUrlContent"));
        }
    }
}
