package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

/**
 * Additional tests for {@link RepairController} covering the external-tool branches (Ghostscript
 * and qpdf). Those branches shell out via the static {@link ProcessExecutor} factory; here that
 * factory is mocked with {@code mockStatic} so no real binary runs. The mocked command-runner
 * writes a valid PDF to the output path so the file-backed response can be streamed back.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class RepairControllerMoreTest {

    @org.mockito.Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @org.mockito.Mock private EndpointConfiguration endpointConfiguration;

    private TempFileManager tempFileManager;
    private RepairController repairController;

    @BeforeEach
    void setUp() {
        tempFileManager = new TempFileManager(new TempFileRegistry(), new ApplicationProperties());
        repairController =
                new RepairController(pdfDocumentFactory, tempFileManager, endpointConfiguration);
    }

    private static byte[] buildPdfBytes(int pageCount) throws IOException {
        try (PDDocument document = new PDDocument();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            for (int i = 0; i < pageCount; i++) {
                document.addPage(new PDPage(PDRectangle.A4));
            }
            document.save(baos);
            return baos.toByteArray();
        }
    }

    private static PDFFile pdfFileFrom(MockMultipartFile multipartFile) {
        PDFFile pdfFile = new PDFFile();
        pdfFile.setFileInput(multipartFile);
        return pdfFile;
    }

    private static MockMultipartFile inputPdf(int pages) throws IOException {
        return new MockMultipartFile(
                "fileInput", "broken.pdf", MediaType.APPLICATION_PDF_VALUE, buildPdfBytes(pages));
    }

    private static byte[] readResource(Resource resource) throws IOException {
        try (InputStream in = resource.getInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            in.transferTo(baos);
            return baos.toByteArray();
        }
    }

    /**
     * Writes a valid PDF to the path at the given command index, mimicking a successful tool run.
     */
    private static void writeValidPdfTo(List<String> command, int outputPathIndex)
            throws Exception {
        Path out = Path.of(command.get(outputPathIndex));
        byte[] pdf = buildPdfBytes(1);
        Files.write(out, pdf);
    }

    private ProcessExecutorResult resultWithRc(int rc) {
        ProcessExecutorResult result = mock(ProcessExecutorResult.class);
        when(result.getRc()).thenReturn(rc);
        return result;
    }

    @Nested
    @DisplayName("Ghostscript primary branch")
    class GhostscriptBranch {

        @Test
        @DisplayName("Ghostscript success returns 200 and does not invoke qpdf or PDFBox")
        void ghostscriptSuccess() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);
            when(endpointConfiguration.isGroupEnabled("qpdf")).thenReturn(true);

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class)) {
                ProcessExecutor gsExecutor = mock(ProcessExecutor.class);
                ProcessExecutorResult okResult = resultWithRc(0);

                // gs command output path is element index 2 ("gs", "-o", <outputPath>, ...)
                when(gsExecutor.runCommandWithOutputHandling(any()))
                        .thenAnswer(
                                inv -> {
                                    List<String> cmd = inv.getArgument(0);
                                    writeValidPdfTo(cmd, 2);
                                    return okResult;
                                });

                mockedFactory
                        .when(
                                () ->
                                        ProcessExecutor.getInstance(
                                                ProcessExecutor.Processes.GHOSTSCRIPT))
                        .thenReturn(gsExecutor);

                ResponseEntity<Resource> response =
                        repairController.repairPdf(pdfFileFrom(inputPdf(1)));

                assertEquals(HttpStatus.OK, response.getStatusCode());
                assertTrue(readResource(response.getBody()).length > 0);

                // qpdf must not be consulted once Ghostscript succeeds.
                mockedFactory.verify(
                        () -> ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF), never());
                // PDFBox last-resort load must not happen either.
                verify(pdfDocumentFactory, never()).load(any(File.class));
            }
        }

        @Test
        @DisplayName("Ghostscript non-zero rc falls back to qpdf which produces output")
        void ghostscriptNonZeroFallsBackToQpdf() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);
            when(endpointConfiguration.isGroupEnabled("qpdf")).thenReturn(true);

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class)) {
                ProcessExecutor gsExecutor = mock(ProcessExecutor.class);
                ProcessExecutorResult failResult = resultWithRc(1);
                when(gsExecutor.runCommandWithOutputHandling(any())).thenReturn(failResult);

                ProcessExecutor qpdfExecutor = mock(ProcessExecutor.class);
                ProcessExecutorResult okResult = resultWithRc(0);
                // qpdf command output path is the last element.
                when(qpdfExecutor.runCommandWithOutputHandling(any()))
                        .thenAnswer(
                                inv -> {
                                    List<String> cmd = inv.getArgument(0);
                                    writeValidPdfTo(cmd, cmd.size() - 1);
                                    return okResult;
                                });

                mockedFactory
                        .when(
                                () ->
                                        ProcessExecutor.getInstance(
                                                ProcessExecutor.Processes.GHOSTSCRIPT))
                        .thenReturn(gsExecutor);
                mockedFactory
                        .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF))
                        .thenReturn(qpdfExecutor);

                ResponseEntity<Resource> response =
                        repairController.repairPdf(pdfFileFrom(inputPdf(1)));

                assertEquals(HttpStatus.OK, response.getStatusCode());
                verify(qpdfExecutor, times(1)).runCommandWithOutputHandling(any());
                verify(pdfDocumentFactory, never()).load(any(File.class));
            }
        }

        @Test
        @DisplayName("Ghostscript throwing is caught and qpdf fallback still succeeds")
        void ghostscriptThrowsFallsBackToQpdf() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);
            when(endpointConfiguration.isGroupEnabled("qpdf")).thenReturn(true);

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class)) {
                ProcessExecutor gsExecutor = mock(ProcessExecutor.class);
                when(gsExecutor.runCommandWithOutputHandling(any()))
                        .thenThrow(new IOException("gs binary not found"));

                ProcessExecutor qpdfExecutor = mock(ProcessExecutor.class);
                ProcessExecutorResult okResult = resultWithRc(0);
                when(qpdfExecutor.runCommandWithOutputHandling(any()))
                        .thenAnswer(
                                inv -> {
                                    List<String> cmd = inv.getArgument(0);
                                    writeValidPdfTo(cmd, cmd.size() - 1);
                                    return okResult;
                                });

                mockedFactory
                        .when(
                                () ->
                                        ProcessExecutor.getInstance(
                                                ProcessExecutor.Processes.GHOSTSCRIPT))
                        .thenReturn(gsExecutor);
                mockedFactory
                        .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF))
                        .thenReturn(qpdfExecutor);

                ResponseEntity<Resource> response =
                        repairController.repairPdf(pdfFileFrom(inputPdf(1)));

                assertEquals(HttpStatus.OK, response.getStatusCode());
                verify(qpdfExecutor, times(1)).runCommandWithOutputHandling(any());
            }
        }
    }

    @Nested
    @DisplayName("qpdf-only branch (Ghostscript disabled)")
    class QpdfOnlyBranch {

        @Test
        @DisplayName("qpdf produces output when Ghostscript is disabled")
        void qpdfOnlySuccess() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("qpdf")).thenReturn(true);

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class)) {
                ProcessExecutor qpdfExecutor = mock(ProcessExecutor.class);
                ProcessExecutorResult okResult = resultWithRc(0);
                when(qpdfExecutor.runCommandWithOutputHandling(any()))
                        .thenAnswer(
                                inv -> {
                                    List<String> cmd = inv.getArgument(0);
                                    writeValidPdfTo(cmd, cmd.size() - 1);
                                    return okResult;
                                });

                mockedFactory
                        .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF))
                        .thenReturn(qpdfExecutor);

                ResponseEntity<Resource> response =
                        repairController.repairPdf(pdfFileFrom(inputPdf(2)));

                assertEquals(HttpStatus.OK, response.getStatusCode());
                assertTrue(readResource(response.getBody()).length > 0);

                // Ghostscript disabled -> its instance must never be requested.
                mockedFactory.verify(
                        () -> ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT),
                        never());
                verify(pdfDocumentFactory, never()).load(any(File.class));
            }
        }

        @Test
        @DisplayName("qpdf IOException propagates to the caller")
        void qpdfIOExceptionPropagates() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("qpdf")).thenReturn(true);

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class)) {
                ProcessExecutor qpdfExecutor = mock(ProcessExecutor.class);
                when(qpdfExecutor.runCommandWithOutputHandling(any()))
                        .thenThrow(new IOException("qpdf failed hard"));

                mockedFactory
                        .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF))
                        .thenReturn(qpdfExecutor);

                IOException thrown =
                        assertThrows(
                                IOException.class,
                                () -> repairController.repairPdf(pdfFileFrom(inputPdf(1))));
                assertEquals("qpdf failed hard", thrown.getMessage());
            }
        }
    }

    @Nested
    @DisplayName("No-tool error branch")
    class NoToolErrorBranch {

        @Test
        @DisplayName("Ghostscript fails and qpdf disabled throws a processing exception")
        void ghostscriptFailsQpdfDisabledThrows() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);
            when(endpointConfiguration.isGroupEnabled("qpdf")).thenReturn(false);

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class)) {
                ProcessExecutor gsExecutor = mock(ProcessExecutor.class);
                ProcessExecutorResult failResult = resultWithRc(1);
                when(gsExecutor.runCommandWithOutputHandling(any())).thenReturn(failResult);

                mockedFactory
                        .when(
                                () ->
                                        ProcessExecutor.getInstance(
                                                ProcessExecutor.Processes.GHOSTSCRIPT))
                        .thenReturn(gsExecutor);

                // Ghostscript "enabled" but unsuccessful, qpdf disabled -> not the PDFBox path.
                assertThrows(
                        Exception.class,
                        () -> repairController.repairPdf(pdfFileFrom(inputPdf(1))));

                // PDFBox last resort only runs when BOTH tools are disabled.
                verify(pdfDocumentFactory, never()).load(any(File.class));
            }
        }
    }

    @Nested
    @DisplayName("Tool availability gating")
    class ToolGating {

        @Test
        @DisplayName("both tools disabled uses PDFBox and never touches ProcessExecutor")
        void bothDisabledUsesPdfBox() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("qpdf")).thenReturn(false);

            PDDocument realDoc = new PDDocument();
            realDoc.addPage(new PDPage(PDRectangle.A4));
            when(pdfDocumentFactory.load(any(File.class))).thenReturn(realDoc);

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class)) {
                ResponseEntity<Resource> response =
                        repairController.repairPdf(pdfFileFrom(inputPdf(1)));

                assertEquals(HttpStatus.OK, response.getStatusCode());
                verify(pdfDocumentFactory, times(1)).load(any(File.class));

                mockedFactory.verify(
                        () ->
                                ProcessExecutor.getInstance(
                                        eq(ProcessExecutor.Processes.GHOSTSCRIPT)),
                        never());
                mockedFactory.verify(
                        () -> ProcessExecutor.getInstance(eq(ProcessExecutor.Processes.QPDF)),
                        never());
            }
        }
    }
}
