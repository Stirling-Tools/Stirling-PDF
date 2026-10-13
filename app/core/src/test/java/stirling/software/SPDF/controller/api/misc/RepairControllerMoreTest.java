package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
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
import stirling.software.jpdfium.doc.PdfRepair;
import stirling.software.jpdfium.doc.RepairResult;

/**
 * Additional tests for {@link RepairController} covering the Ghostscript primary and JPDFium
 * fallback branches. Ghostscript shells out via the static {@link ProcessExecutor} factory and
 * JPDFium would load natives via the static {@link PdfRepair#repairFile}; both are mocked with
 * {@code mockStatic} so no real binary runs and no natives load.
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

    private ProcessExecutorResult resultWithRc(int rc) {
        ProcessExecutorResult result = mock(ProcessExecutorResult.class);
        when(result.getRc()).thenReturn(rc);
        return result;
    }

    /**
     * Stubs the JPDFium file repair to return the given status without loading natives, writing
     * real bytes to the output path on success like the native call would.
     */
    private static void stubJpdfiumRepair(
            MockedStatic<PdfRepair> mockedRepair, RepairResult.Status status) throws IOException {
        byte[] repaired = buildPdfBytes(1);
        mockedRepair
                .when(() -> PdfRepair.repairFile(any(Path.class), any(Path.class), anyInt()))
                .thenAnswer(
                        inv -> {
                            if (status != RepairResult.Status.FAILED) {
                                Files.write(inv.getArgument(1), repaired);
                            }
                            return status;
                        });
    }

    @Nested
    @DisplayName("Ghostscript primary branch")
    class GhostscriptBranch {

        @Test
        @DisplayName("Ghostscript success returns 200 and does not invoke JPDFium or PDFBox")
        void ghostscriptSuccess() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class);
                    MockedStatic<PdfRepair> mockedRepair = mockStatic(PdfRepair.class)) {
                ProcessExecutor gsExecutor = mock(ProcessExecutor.class);
                ProcessExecutorResult okResult = resultWithRc(0);

                // gs command output path is element index 2 ("gs", "-o", <outputPath>, ...)
                when(gsExecutor.runCommandWithOutputHandling(any()))
                        .thenAnswer(
                                inv -> {
                                    List<String> cmd = inv.getArgument(0);
                                    Files.write(Path.of(cmd.get(2)), buildPdfBytes(1));
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

                // JPDFium must not be consulted once Ghostscript succeeds.
                mockedRepair.verify(
                        () -> PdfRepair.repairFile(any(Path.class), any(Path.class), anyInt()),
                        never());
                // PDFBox last-resort load must not happen either.
                verify(pdfDocumentFactory, never()).load(any(File.class));
            }
        }

        @Test
        @DisplayName("Ghostscript non-zero rc falls back to JPDFium which produces output")
        void ghostscriptNonZeroFallsBackToJpdfium() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class);
                    MockedStatic<PdfRepair> mockedRepair = mockStatic(PdfRepair.class)) {
                ProcessExecutor gsExecutor = mock(ProcessExecutor.class);
                ProcessExecutorResult failResult = resultWithRc(1);
                when(gsExecutor.runCommandWithOutputHandling(any())).thenReturn(failResult);

                stubJpdfiumRepair(mockedRepair, RepairResult.Status.FIXED);

                mockedFactory
                        .when(
                                () ->
                                        ProcessExecutor.getInstance(
                                                ProcessExecutor.Processes.GHOSTSCRIPT))
                        .thenReturn(gsExecutor);

                ResponseEntity<Resource> response =
                        repairController.repairPdf(pdfFileFrom(inputPdf(1)));

                assertEquals(HttpStatus.OK, response.getStatusCode());
                mockedRepair.verify(
                        () -> PdfRepair.repairFile(any(Path.class), any(Path.class), anyInt()),
                        times(1));
                verify(pdfDocumentFactory, never()).load(any(File.class));
            }
        }

        @Test
        @DisplayName("Ghostscript throwing is caught and JPDFium fallback still succeeds")
        void ghostscriptThrowsFallsBackToJpdfium() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class);
                    MockedStatic<PdfRepair> mockedRepair = mockStatic(PdfRepair.class)) {
                ProcessExecutor gsExecutor = mock(ProcessExecutor.class);
                when(gsExecutor.runCommandWithOutputHandling(any()))
                        .thenThrow(new IOException("gs binary not found"));

                stubJpdfiumRepair(mockedRepair, RepairResult.Status.FIXED);

                mockedFactory
                        .when(
                                () ->
                                        ProcessExecutor.getInstance(
                                                ProcessExecutor.Processes.GHOSTSCRIPT))
                        .thenReturn(gsExecutor);

                ResponseEntity<Resource> response =
                        repairController.repairPdf(pdfFileFrom(inputPdf(1)));

                assertEquals(HttpStatus.OK, response.getStatusCode());
                mockedRepair.verify(
                        () -> PdfRepair.repairFile(any(Path.class), any(Path.class), anyInt()),
                        times(1));
            }
        }
    }

    @Nested
    @DisplayName("JPDFium fallback branch (Ghostscript disabled)")
    class JpdfiumFallbackBranch {

        @Test
        @DisplayName("JPDFium produces output when Ghostscript is disabled")
        void jpdfiumSuccessWhenGhostscriptDisabled() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(false);

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class);
                    MockedStatic<PdfRepair> mockedRepair = mockStatic(PdfRepair.class)) {
                stubJpdfiumRepair(mockedRepair, RepairResult.Status.FIXED);

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
        @DisplayName("a JPDFium refusal after Ghostscript failed falls through to PDFBox")
        void jpdfiumDeclinesAfterGhostscriptFailsFallsThroughToPdfBox() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);

            PDDocument realDoc = new PDDocument();
            realDoc.addPage(new PDPage(PDRectangle.A4));
            when(pdfDocumentFactory.load(any(File.class))).thenReturn(realDoc);

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class);
                    MockedStatic<PdfRepair> mockedRepair = mockStatic(PdfRepair.class)) {
                ProcessExecutor gsExecutor = mock(ProcessExecutor.class);
                when(gsExecutor.runCommandWithOutputHandling(any()))
                        .thenThrow(new IOException("gs failed hard"));

                stubJpdfiumRepair(mockedRepair, RepairResult.Status.FAILED);

                mockedFactory
                        .when(
                                () ->
                                        ProcessExecutor.getInstance(
                                                ProcessExecutor.Processes.GHOSTSCRIPT))
                        .thenReturn(gsExecutor);

                // Nothing is gated anymore: Ghostscript failed and JPDFium declined, so the
                // PDFBox last resort still runs.
                ResponseEntity<Resource> response =
                        repairController.repairPdf(pdfFileFrom(inputPdf(1)));

                assertEquals(HttpStatus.OK, response.getStatusCode());
                verify(pdfDocumentFactory, times(1)).load(any(File.class));
            }
        }

        @Test
        @DisplayName("a JPDFium throw falls through to the PDFBox last resort")
        void jpdfiumThrowFallsThroughToPdfBox() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(false);

            PDDocument realDoc = new PDDocument();
            realDoc.addPage(new PDPage(PDRectangle.A4));
            when(pdfDocumentFactory.load(any(File.class))).thenReturn(realDoc);

            try (MockedStatic<PdfRepair> mockedRepair = mockStatic(PdfRepair.class)) {
                mockedRepair
                        .when(
                                () ->
                                        PdfRepair.repairFile(
                                                any(Path.class), any(Path.class), anyInt()))
                        .thenThrow(new IllegalStateException("boom"));

                ResponseEntity<Resource> response =
                        repairController.repairPdf(pdfFileFrom(inputPdf(1)));

                assertEquals(HttpStatus.OK, response.getStatusCode());
                verify(pdfDocumentFactory, times(1)).load(any(File.class));
            }
        }
    }

    @Nested
    @DisplayName("All-tools-failed branch")
    class AllToolsFailedBranch {

        @Test
        @DisplayName("Ghostscript fails, JPDFium declines and PDFBox errors propagates the error")
        void allToolsFailPropagatesLoadError() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(true);

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class);
                    MockedStatic<PdfRepair> mockedRepair = mockStatic(PdfRepair.class)) {
                ProcessExecutor gsExecutor = mock(ProcessExecutor.class);
                ProcessExecutorResult failResult = resultWithRc(1);
                when(gsExecutor.runCommandWithOutputHandling(any())).thenReturn(failResult);

                stubJpdfiumRepair(mockedRepair, RepairResult.Status.FAILED);

                mockedFactory
                        .when(
                                () ->
                                        ProcessExecutor.getInstance(
                                                ProcessExecutor.Processes.GHOSTSCRIPT))
                        .thenReturn(gsExecutor);

                when(pdfDocumentFactory.load(any(File.class)))
                        .thenThrow(new IOException("broken beyond repair"));

                // No coded refusal anymore: the last resort runs and its error propagates.
                assertThrows(
                        IOException.class,
                        () -> repairController.repairPdf(pdfFileFrom(inputPdf(1))));
            }
        }
    }

    @Nested
    @DisplayName("Tool availability gating")
    class ToolGating {

        @Test
        @DisplayName(
                "Ghostscript disabled tries JPDFium then PDFBox, never touching ProcessExecutor")
        void ghostscriptDisabledUsesJpdfiumThenPdfBox() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(false);

            PDDocument realDoc = new PDDocument();
            realDoc.addPage(new PDPage(PDRectangle.A4));
            when(pdfDocumentFactory.load(any(File.class))).thenReturn(realDoc);

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class);
                    MockedStatic<PdfRepair> mockedRepair = mockStatic(PdfRepair.class)) {
                stubJpdfiumRepair(mockedRepair, RepairResult.Status.FAILED);

                ResponseEntity<Resource> response =
                        repairController.repairPdf(pdfFileFrom(inputPdf(1)));

                assertEquals(HttpStatus.OK, response.getStatusCode());
                mockedRepair.verify(
                        () -> PdfRepair.repairFile(any(Path.class), any(Path.class), anyInt()),
                        times(1));
                verify(pdfDocumentFactory, times(1)).load(any(File.class));

                mockedFactory.verify(
                        () -> ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT),
                        never());
            }
        }
    }
}
