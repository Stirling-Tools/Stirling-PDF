package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
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

import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import stirling.software.SPDF.model.api.converters.UrlToPdfRequest;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.ProcessExecutor.Processes;
import stirling.software.common.util.WebResponseUtils;

public class ConvertWebsiteToPdfTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private RuntimePathConfig runtimePathConfig;

    private ApplicationProperties applicationProperties;
    private ConvertWebsiteToPDF sut;
    private AutoCloseable mocks;

    @BeforeEach
    void setUp() throws Exception {
        mocks = MockitoAnnotations.openMocks(this);

        // Enable feature (adjust structure for your project if necessary)
        applicationProperties = new ApplicationProperties();
        applicationProperties.getSystem().setEnableUrlToPDF(true);

        // Stubs in case the code continues to run
        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/usr/bin/weasyprint");
        when(pdfDocumentFactory.load(any(File.class))).thenReturn(new PDDocument());

        // Build SUT
        sut = new ConvertWebsiteToPDF(pdfDocumentFactory, runtimePathConfig, applicationProperties);

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
        assertTrue(out.matches("[A-Za-z0-9_]+\\.pdf"));
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
        assertTrue(out.matches("[A-Za-z0-9_]+\\.pdf"));
        // safeName limited to 50 -> total max 54 including '.pdf'
        assertTrue(out.length() <= 54, "Filename should be truncated to 50 + '.pdf'");
    }

    @Test
    void happy_path_executes_weasyprint_loads_pdf_and_returns_response() throws Exception {
        UrlToPdfRequest request = new UrlToPdfRequest();
        request.setUrlInput("https://example.com");

        try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class);
                MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class);
                MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<HttpClient> httpClient = mockHttpClientReturning("<html></html>")) {

            // Force URL checks to be positive
            gu.when(() -> GeneralUtils.isValidURL("https://example.com")).thenReturn(true);
            gu.when(() -> GeneralUtils.isURLReachable("https://example.com")).thenReturn(true);

            // correct ProcessExecutor!
            ProcessExecutor mockExec = Mockito.mock(ProcessExecutor.class);
            pe.when(() -> ProcessExecutor.getInstance(Processes.WEASYPRINT)).thenReturn(mockExec);

            @SuppressWarnings("unchecked")
            ArgumentCaptor<List<String>> cmdCaptor = ArgumentCaptor.forClass(List.class);

            // Return value of correct type
            ProcessExecutorResult dummyResult = Mockito.mock(ProcessExecutorResult.class);
            when(mockExec.runCommandWithOutputHandling(cmdCaptor.capture()))
                    .thenReturn(dummyResult);

            // Mock WebResponseUtils
            ResponseEntity<byte[]> fakeResponse = ResponseEntity.ok(new byte[0]);
            wr.when(() -> WebResponseUtils.pdfDocToWebResponse(any(PDDocument.class), anyString()))
                    .thenReturn(fakeResponse);

            // Act
            ResponseEntity<?> resp = sut.urlToPdf(request);

            // Assert – Response OK
            assertEquals(HttpStatus.OK, resp.getStatusCode());

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
            Path outPath = Path.of(outPathStr);
            assertFalse(
                    Files.exists(Path.of(htmlPathStr)),
                    "Temp HTML file should be deleted after the call");
        }
    }

    @Test
    void finally_block_logs_and_swallows_ioexception_on_delete() throws Exception {
        // Arrange
        UrlToPdfRequest request = new UrlToPdfRequest();
        request.setUrlInput("https://example.com");

        Path preCreatedTemp = java.nio.file.Files.createTempFile("test_output_", ".pdf");
        Path htmlTemp = java.nio.file.Files.createTempFile("test_input_", ".html");

        try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class);
                MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class);
                MockedStatic<Files> files = Mockito.mockStatic(Files.class);
                MockedStatic<HttpClient> httpClient = mockHttpClientReturning("<html></html>")) {

            // Force URL checks to be positive
            gu.when(() -> GeneralUtils.isValidURL("https://example.com")).thenReturn(true);
            gu.when(() -> GeneralUtils.isURLReachable("https://example.com")).thenReturn(true);

            // Force temp files + provoke delete error
            files.when(() -> Files.createTempFile("url_input_", ".html")).thenReturn(htmlTemp);
            files.when(() -> Files.createTempFile("output_", ".pdf")).thenReturn(preCreatedTemp);
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
            files.when(() -> Files.exists(preCreatedTemp)).thenReturn(true); // for the assert

            // ProcessExecutor
            ProcessExecutor mockExec = Mockito.mock(ProcessExecutor.class);
            pe.when(() -> ProcessExecutor.getInstance(Processes.WEASYPRINT)).thenReturn(mockExec);
            ProcessExecutorResult dummy = Mockito.mock(ProcessExecutorResult.class);
            when(mockExec.runCommandWithOutputHandling(Mockito.<List>any())).thenReturn(dummy);

            // WebResponseUtils
            ResponseEntity<byte[]> fakeResponse = ResponseEntity.ok(new byte[0]);
            wr.when(() -> WebResponseUtils.pdfDocToWebResponse(any(PDDocument.class), anyString()))
                    .thenReturn(fakeResponse);

            // Act: should not throw and should return a Response
            ResponseEntity<?> resp = assertDoesNotThrow(() -> sut.urlToPdf(request));

            // Assert
            assertNotNull(resp, "Response should not be null");
            assertEquals(HttpStatus.OK, resp.getStatusCode());
            assertTrue(
                    java.nio.file.Files.exists(preCreatedTemp),
                    "Temp file should still exist despite delete IOException");
        } finally {
            try {
                java.nio.file.Files.deleteIfExists(preCreatedTemp);
                java.nio.file.Files.deleteIfExists(htmlTemp);
            } catch (IOException ignore) {
            }
        }
    }

    @Test
    void redirect_with_error_when_disallowed_content_detected() throws Exception {
        UrlToPdfRequest request = new UrlToPdfRequest();
        request.setUrlInput("https://example.com");

        try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<HttpClient> httpClient =
                        mockHttpClientReturning(
                                "<link rel=\"attachment\" href=\"file:///etc/passwd\">"); ) {

            gu.when(() -> GeneralUtils.isValidURL("https://example.com")).thenReturn(true);
            gu.when(() -> GeneralUtils.isURLReachable("https://example.com")).thenReturn(true);

            ResponseEntity<?> resp = sut.urlToPdf(request);

            assertEquals(HttpStatus.SEE_OTHER, resp.getStatusCode());
            URI location = resp.getHeaders().getLocation();
            assertNotNull(location, "Location header expected");
            assertTrue(
                    location.getQuery() != null
                            && location.getQuery().contains("error=error.disallowedUrlContent"));
        }
    }

    private MockedStatic<HttpClient> mockHttpClientReturning(String body) throws Exception {
        MockedStatic<HttpClient> httpClientStatic = Mockito.mockStatic(HttpClient.class);
        HttpClient.Builder builder = Mockito.mock(HttpClient.Builder.class);
        HttpClient client = Mockito.mock(HttpClient.class);
        HttpResponse<String> response = Mockito.mock(HttpResponse.class);

        httpClientStatic.when(HttpClient::newBuilder).thenReturn(builder);
        when(builder.followRedirects(HttpClient.Redirect.NORMAL)).thenReturn(builder);
        when(builder.connectTimeout(any(Duration.class))).thenReturn(builder);
        when(builder.build()).thenReturn(client);

        when(client.send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class)))
                .thenReturn(response);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn(body);

        return httpClientStatic;
    }
}
