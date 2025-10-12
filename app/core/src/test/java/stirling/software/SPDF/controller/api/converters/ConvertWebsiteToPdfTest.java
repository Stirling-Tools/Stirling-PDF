package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.Method;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
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

        // Feature einschalten (ggf. Struktur an dein Projekt anpassen)
        applicationProperties = new ApplicationProperties();
        applicationProperties.getSystem().setEnableUrlToPDF(true);

        // Stubs, falls der Code weiterlaufen sollte
        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/usr/bin/weasyprint");
        when(pdfDocumentFactory.load(any(File.class))).thenReturn(new PDDocument());

        // SUT bauen
        sut = new ConvertWebsiteToPDF(pdfDocumentFactory, runtimePathConfig, applicationProperties);

        // RequestContext für ServletUriComponentsBuilder bereitstellen
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
        // .invalid is reserved per RFC and cannot be resolved
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
        // Disable the feature
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
        // Only A–Z, a–z, 0–9, and underscore are allowed
        assertTrue(out.matches("[A-Za-z0-9_]+\\.pdf"));
        // No truncation occurs here (the source is not that long)
        assertTrue(out.length() <= 54);
    }

    @Test
    void convertURLToFileName_truncates_to_50_chars_before_pdf_suffix() throws Exception {
        Method m =
                ConvertWebsiteToPDF.class.getDeclaredMethod("convertURLToFileName", String.class);
        m.setAccessible(true);

        // Very long URL triggers truncation
        String longUrl =
                "https://very-very-long-domain.example.com/some/really/long/path/with?many=params&and=chars";
        String out = (String) m.invoke(sut, longUrl);

        assertTrue(out.endsWith(".pdf"));
        assertTrue(out.matches("[A-Za-z0-9_]+\\.pdf"));
        // safeName is limited to 50 -> total max 54 including ".pdf"
        assertTrue(out.length() <= 54, "Filename should be truncated to 50 + '.pdf'");
    }

    @Test
    void happy_path_executes_weasyprint_loads_pdf_and_returns_response() throws Exception {
        UrlToPdfRequest request = new UrlToPdfRequest();
        request.setUrlInput("https://example.com");

        try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class);
                MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class);
                MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {

            // Force URL checks to pass
            gu.when(() -> GeneralUtils.isValidURL("https://example.com")).thenReturn(true);
            gu.when(() -> GeneralUtils.isURLReachable("https://example.com")).thenReturn(true);

            // Use the correct ProcessExecutor instance!
            ProcessExecutor mockExec = Mockito.mock(ProcessExecutor.class);
            pe.when(() -> ProcessExecutor.getInstance(Processes.WEASYPRINT)).thenReturn(mockExec);

            @SuppressWarnings("unchecked")
            ArgumentCaptor<List<String>> cmdCaptor = ArgumentCaptor.forClass(List.class);

            // Return value with the expected type
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

            // Assert – WeasyPrint command is correct
            List<String> cmd = cmdCaptor.getValue();
            assertNotNull(cmd);
            assertEquals("/usr/bin/weasyprint", cmd.get(0));
            assertEquals("https://example.com", cmd.get(1));
            assertEquals("--pdf-forms", cmd.get(2));
            assertTrue(cmd.size() >= 4, "WeasyPrint should receive an output path");
            String outPathStr = cmd.get(3);
            assertNotNull(outPathStr);

            // Temp file must be deleted in the finally block
            Path outPath = Path.of(outPathStr);
            assertFalse(Files.exists(outPath), "Temp output file should be deleted after the call");
        }
    }

    @Test
    void finally_block_logs_and_swallows_ioexception_on_delete() throws Exception {
        // Arrange
        UrlToPdfRequest request = new UrlToPdfRequest();
        request.setUrlInput("https://example.com");

        Path preCreatedTemp = java.nio.file.Files.createTempFile("test_output_", ".pdf");

        try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class);
                MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class);
                MockedStatic<Files> files = Mockito.mockStatic(Files.class)) {

            // URL checks should pass
            gu.when(() -> GeneralUtils.isValidURL("https://example.com")).thenReturn(true);
            gu.when(() -> GeneralUtils.isURLReachable("https://example.com")).thenReturn(true);

            // Force temp file creation and trigger a delete failure
            files.when(() -> Files.createTempFile("output_", ".pdf")).thenReturn(preCreatedTemp);
            files.when(() -> Files.deleteIfExists(preCreatedTemp))
                    .thenThrow(new IOException("fail delete"));
            files.when(() -> Files.exists(preCreatedTemp)).thenReturn(true); // for the assertion

            // ProcessExecutor
            ProcessExecutor mockExec = Mockito.mock(ProcessExecutor.class);
            pe.when(() -> ProcessExecutor.getInstance(Processes.WEASYPRINT)).thenReturn(mockExec);
            ProcessExecutorResult dummy = Mockito.mock(ProcessExecutorResult.class);
            when(mockExec.runCommandWithOutputHandling(Mockito.<List>any())).thenReturn(dummy);

            // WebResponseUtils
            ResponseEntity<byte[]> fakeResponse = ResponseEntity.ok(new byte[0]);
            wr.when(() -> WebResponseUtils.pdfDocToWebResponse(any(PDDocument.class), anyString()))
                    .thenReturn(fakeResponse);

            // Act: should not throw an exception and must return a response
            ResponseEntity<?> resp = assertDoesNotThrow(() -> sut.urlToPdf(request));

            // Assert
            assertNotNull(resp, "Response should not be null");
            assertEquals(HttpStatus.OK, resp.getStatusCode());
            assertTrue(
                    java.nio.file.Files.exists(preCreatedTemp),
                    "Temp file should still exist despite the delete IOException");
        } finally {
            try {
                java.nio.file.Files.deleteIfExists(preCreatedTemp);
            } catch (IOException ignore) {
            }
        }
    }
}
