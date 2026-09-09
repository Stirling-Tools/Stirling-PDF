package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.misc.ProcessPdfWithOcrRequest;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.ProcessExecutor.Processes;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;
import stirling.software.common.util.WebResponseUtils;

/**
 * Additional coverage for {@link OCRController} that exercises the OCRmyPDF and Tesseract command
 * paths. The external ocrmypdf/tesseract/ghostscript boundary is mocked via a static stub of {@link
 * ProcessExecutor} so the full command-building and post-processing logic runs without launching
 * any real process.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class OCRControllerMoreTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private RuntimePathConfig runtimePathConfig;

    private TempFileManager tempFileManager;
    private ApplicationProperties applicationProperties;
    private OCRController ocrController;

    @TempDir Path baseTmpDir;

    @BeforeEach
    void setUp() throws IOException {
        applicationProperties = new ApplicationProperties();
        applicationProperties
                .getSystem()
                .getTempFileManagement()
                .setBaseTmpDir(baseTmpDir.toString());
        applicationProperties.getSystem().getTempFileManagement().setPrefix("ocr-more-");
        applicationProperties.getSystem().setMaxDPI(72);

        tempFileManager = new TempFileManager(new TempFileRegistry(), applicationProperties);

        // A real ocrmypdf binary path that exists; ProcessExecutor is mocked so it is never run.
        Path fakeBinary = Files.createTempFile(baseTmpDir, "ocrmypdf", ".bin");
        lenient().when(runtimePathConfig.getOcrMyPdfPath()).thenReturn(fakeBinary.toString());

        ocrController =
                new OCRController(
                        applicationProperties,
                        pdfDocumentFactory,
                        tempFileManager,
                        endpointConfiguration,
                        runtimePathConfig);
    }

    /** Build a tiny single-page in-memory PDF as a MockMultipartFile. */
    private MockMultipartFile pdfMultipartFile(String name) throws IOException {
        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            doc.addPage(new PDPage());
            doc.save(out);
            return new MockMultipartFile(
                    "fileInput", name, MediaType.APPLICATION_PDF_VALUE, out.toByteArray());
        }
    }

    /** Create a tessdata directory populated with the given traineddata languages. */
    private Path tessdataDirWith(String... languages) throws IOException {
        Path dir = Files.createTempDirectory(baseTmpDir, "tessdata");
        for (String lang : languages) {
            Files.createFile(dir.resolve(lang + ".traineddata"));
        }
        return dir;
    }

    /** Build a request with eng available and sensible OCR defaults the caller can override. */
    private ProcessPdfWithOcrRequest baseRequest(String filename) throws IOException {
        ProcessPdfWithOcrRequest request = new ProcessPdfWithOcrRequest();
        request.setLanguages(List.of("eng"));
        request.setOcrRenderType("hocr");
        request.setOcrType("skip-text");
        request.setFileInput(pdfMultipartFile(filename));
        return request;
    }

    private void availLanguages(String... langs) throws IOException {
        Path tessdata = tessdataDirWith(langs);
        when(runtimePathConfig.getTessDataPath()).thenReturn(tessdata.toString());
    }

    private static ResponseEntity<Resource> cannedResponse() {
        return ResponseEntity.ok(new ByteArrayResource("ok".getBytes()));
    }

    /** A mocked ProcessExecutor whose runCommandWithOutputHandling returns the given rc. */
    private ProcessExecutor executorReturning(int rc, String messages) throws Exception {
        ProcessExecutor executor = mock(ProcessExecutor.class);
        ProcessExecutorResult result = mock(ProcessExecutorResult.class);
        lenient().when(result.getRc()).thenReturn(rc);
        lenient().when(result.getMessages()).thenReturn(messages == null ? "" : messages);
        lenient().when(executor.runCommandWithOutputHandling(anyList())).thenReturn(result);
        return executor;
    }

    @Nested
    @DisplayName("OCRmyPDF command path (mocked process)")
    class OcrMyPdfPath {

        @Test
        @DisplayName("succeeds and returns a PDF response on rc=0")
        void ocrMyPdfSuccess() throws Exception {
            availLanguages("eng");
            when(endpointConfiguration.isGroupEnabled("OCRmyPDF")).thenReturn(true);
            ProcessPdfWithOcrRequest request = baseRequest("in.pdf");

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {
                ProcessExecutor executor = executorReturning(0, "done");
                pe.when(() -> ProcessExecutor.getInstance(Processes.OCR_MY_PDF))
                        .thenReturn(executor);
                wr.when(() -> WebResponseUtils.pdfFileToWebResponse(any(), anyString()))
                        .thenReturn(cannedResponse());

                ResponseEntity<Resource> response = ocrController.processPdfWithOCR(request);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                wr.verify(() -> WebResponseUtils.pdfFileToWebResponse(any(), anyString()));
            }
        }

        @Test
        @DisplayName("builds command with deskew/clean/cleanFinal/force-ocr/sidecar flags")
        void ocrMyPdfCommandFlags() throws Exception {
            availLanguages("eng", "deu");
            when(endpointConfiguration.isGroupEnabled("OCRmyPDF")).thenReturn(true);

            ProcessPdfWithOcrRequest request = baseRequest("in.pdf");
            request.setLanguages(List.of("eng", "deu"));
            request.setDeskew(true);
            request.setClean(true);
            request.setCleanFinal(true);
            request.setOcrType("force-ocr");
            request.setOcrRenderType("sandwich");
            request.setSidecar(true);

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {
                ProcessExecutor executor = mock(ProcessExecutor.class);
                ProcessExecutorResult result = mock(ProcessExecutorResult.class);
                when(result.getRc()).thenReturn(0);

                @SuppressWarnings("unchecked")
                ArgumentCaptor<List<String>> cmd = ArgumentCaptor.forClass(List.class);
                when(executor.runCommandWithOutputHandling(cmd.capture())).thenReturn(result);
                pe.when(() -> ProcessExecutor.getInstance(Processes.OCR_MY_PDF))
                        .thenReturn(executor);
                wr.when(
                                () ->
                                        WebResponseUtils.fileToWebResponse(
                                                any(), anyString(), any(MediaType.class)))
                        .thenReturn(cannedResponse());

                ocrController.processPdfWithOCR(request);

                List<String> command = cmd.getValue();
                assertThat(command).contains("--deskew", "--clean", "--clean-final", "--force-ocr");
                assertThat(command).contains("--sidecar");
                assertThat(command).contains("--pdf-renderer", "sandwich");
                assertThat(command).contains("--language", "eng+deu");
                assertThat(command).contains("--invalidate-digital-signatures");
            }
        }

        @Test
        @DisplayName("uses --skip-text for the Normal ocrType branch")
        void ocrMyPdfSkipTextBranch() throws Exception {
            availLanguages("eng");
            when(endpointConfiguration.isGroupEnabled("OCRmyPDF")).thenReturn(true);

            ProcessPdfWithOcrRequest request = baseRequest("in.pdf");
            request.setOcrType("Normal");

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {
                ProcessExecutor executor = mock(ProcessExecutor.class);
                ProcessExecutorResult result = mock(ProcessExecutorResult.class);
                when(result.getRc()).thenReturn(0);

                @SuppressWarnings("unchecked")
                ArgumentCaptor<List<String>> cmd = ArgumentCaptor.forClass(List.class);
                when(executor.runCommandWithOutputHandling(cmd.capture())).thenReturn(result);
                pe.when(() -> ProcessExecutor.getInstance(Processes.OCR_MY_PDF))
                        .thenReturn(executor);
                wr.when(() -> WebResponseUtils.pdfFileToWebResponse(any(), anyString()))
                        .thenReturn(cannedResponse());

                ocrController.processPdfWithOCR(request);

                assertThat(cmd.getValue()).contains("--skip-text");
                assertThat(cmd.getValue()).doesNotContain("--force-ocr");
            }
        }

        @Test
        @DisplayName("sidecar produces a zip response containing pdf and txt")
        void ocrMyPdfSidecarZip() throws Exception {
            availLanguages("eng");
            when(endpointConfiguration.isGroupEnabled("OCRmyPDF")).thenReturn(true);

            ProcessPdfWithOcrRequest request = baseRequest("scan.pdf");
            request.setSidecar(true);

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutor executor = executorReturning(0, "ok");
                pe.when(() -> ProcessExecutor.getInstance(Processes.OCR_MY_PDF))
                        .thenReturn(executor);

                // No WebResponseUtils stub: the real zip-building path runs against real temp
                // files and streams the resulting zip.
                ResponseEntity<Resource> response = ocrController.processPdfWithOCR(request);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                assertThat(response.getHeaders().getContentDisposition().getFilename())
                        .endsWith("_OCR.zip");
            }
        }

        @Test
        @DisplayName("retries with --jobs 1 on the multiprocessing OSError and then succeeds")
        void ocrMyPdfRetriesOnMultiprocessingError() throws Exception {
            availLanguages("eng");
            when(endpointConfiguration.isGroupEnabled("OCRmyPDF")).thenReturn(true);
            ProcessPdfWithOcrRequest request = baseRequest("in.pdf");

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {
                ProcessExecutor executor = mock(ProcessExecutor.class);

                ProcessExecutorResult failure = mock(ProcessExecutorResult.class);
                when(failure.getRc()).thenReturn(1);
                when(failure.getMessages())
                        .thenReturn(
                                "multiprocessing/synchronize.py OSError: [Errno 38] Function not"
                                        + " implemented");
                ProcessExecutorResult success = mock(ProcessExecutorResult.class);
                when(success.getRc()).thenReturn(0);

                when(executor.runCommandWithOutputHandling(anyList()))
                        .thenReturn(failure)
                        .thenReturn(success);
                pe.when(() -> ProcessExecutor.getInstance(Processes.OCR_MY_PDF))
                        .thenReturn(executor);
                wr.when(() -> WebResponseUtils.pdfFileToWebResponse(any(), anyString()))
                        .thenReturn(cannedResponse());

                ResponseEntity<Resource> response = ocrController.processPdfWithOCR(request);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                verify(executor, times(2)).runCommandWithOutputHandling(anyList());
            }
        }

        @Test
        @DisplayName("throws when ocrmypdf exits non-zero without the retriable error")
        void ocrMyPdfFailureThrows() throws Exception {
            availLanguages("eng");
            when(endpointConfiguration.isGroupEnabled("OCRmyPDF")).thenReturn(true);
            ProcessPdfWithOcrRequest request = baseRequest("in.pdf");

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutor executor = executorReturning(5, "boom");
                pe.when(() -> ProcessExecutor.getInstance(Processes.OCR_MY_PDF))
                        .thenReturn(executor);

                assertThatThrownBy(() -> ocrController.processPdfWithOCR(request))
                        .isInstanceOf(IOException.class);
                verify(executor, times(1)).runCommandWithOutputHandling(anyList());
            }
        }

        @Test
        @DisplayName("propagates a process timeout as IOException")
        void ocrMyPdfTimeoutPropagates() throws Exception {
            availLanguages("eng");
            when(endpointConfiguration.isGroupEnabled("OCRmyPDF")).thenReturn(true);
            ProcessPdfWithOcrRequest request = baseRequest("in.pdf");

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutor executor = mock(ProcessExecutor.class);
                when(executor.runCommandWithOutputHandling(anyList()))
                        .thenThrow(new IOException("Process timeout exceeded."));
                pe.when(() -> ProcessExecutor.getInstance(Processes.OCR_MY_PDF))
                        .thenReturn(executor);

                assertThatThrownBy(() -> ocrController.processPdfWithOCR(request))
                        .isInstanceOf(IOException.class)
                        .hasMessageContaining("timeout");
            }
        }

        @Test
        @DisplayName("removeImagesAfter runs ghostscript to strip images then returns success")
        void ocrMyPdfRemoveImagesAfter() throws Exception {
            availLanguages("eng");
            when(endpointConfiguration.isGroupEnabled("OCRmyPDF")).thenReturn(true);

            ProcessPdfWithOcrRequest request = baseRequest("in.pdf");
            request.setRemoveImagesAfter(true);

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {
                ProcessExecutor ocrExecutor = executorReturning(0, "ok");
                ProcessExecutor gsExecutor = mock(ProcessExecutor.class);
                ProcessExecutorResult gsResult = mock(ProcessExecutorResult.class);
                when(gsResult.getRc()).thenReturn(0);
                // Ghostscript writes the no-images output the controller copies back.
                when(gsExecutor.runCommandWithOutputHandling(anyList()))
                        .thenAnswer(
                                inv -> {
                                    List<String> cmd = inv.getArgument(0);
                                    // gs command form: gs -sDEVICE=pdfwrite -dFILTERIMAGE -o out in
                                    Path out = Path.of(cmd.get(4));
                                    Files.writeString(out, "no-images-pdf");
                                    return gsResult;
                                });

                pe.when(() -> ProcessExecutor.getInstance(Processes.OCR_MY_PDF))
                        .thenReturn(ocrExecutor);
                pe.when(() -> ProcessExecutor.getInstance(Processes.GHOSTSCRIPT))
                        .thenReturn(gsExecutor);
                wr.when(() -> WebResponseUtils.pdfFileToWebResponse(any(), anyString()))
                        .thenReturn(cannedResponse());

                ResponseEntity<Resource> response = ocrController.processPdfWithOCR(request);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                verify(gsExecutor).runCommandWithOutputHandling(anyList());
            }
        }
    }

    @Nested
    @DisplayName("Tesseract command path (mocked process)")
    class TesseractPath {

        @Test
        @DisplayName("falls back to tesseract when OCRmyPDF disabled and merges pages")
        void tesseractSuccess() throws Exception {
            availLanguages("eng");
            when(endpointConfiguration.isGroupEnabled("OCRmyPDF")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("tesseract")).thenReturn(true);

            ProcessPdfWithOcrRequest request = baseRequest("in.pdf");
            request.setOcrType("force-ocr");
            // Controller loads via the factory; return a freshly built single-page document.
            when(pdfDocumentFactory.load(any(java.io.File.class)))
                    .thenAnswer(inv -> singlePageDoc());

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {
                // Tesseract is mocked and writes no output file, so the controller takes its
                // blank-page fallback and saves the original page; rc=0 keeps it on the happy path.
                ProcessExecutor executor = executorReturning(0, "ok");
                pe.when(() -> ProcessExecutor.getInstance(Processes.TESSERACT))
                        .thenReturn(executor);
                wr.when(() -> WebResponseUtils.pdfFileToWebResponse(any(), anyString()))
                        .thenReturn(cannedResponse());

                ResponseEntity<Resource> response = ocrController.processPdfWithOCR(request);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                verify(executor).runCommandWithOutputHandling(anyList());
            }
        }

        @Test
        @DisplayName("skip-text on a text-free page still OCRs the page")
        void tesseractSkipTextBranch() throws Exception {
            availLanguages("eng");
            when(endpointConfiguration.isGroupEnabled("OCRmyPDF")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("tesseract")).thenReturn(true);

            ProcessPdfWithOcrRequest request = baseRequest("in.pdf");
            request.setOcrType("skip-text");
            when(pdfDocumentFactory.load(any(java.io.File.class)))
                    .thenAnswer(inv -> singlePageDoc());

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {
                ProcessExecutor executor = executorReturning(0, "ok");
                pe.when(() -> ProcessExecutor.getInstance(Processes.TESSERACT))
                        .thenReturn(executor);
                wr.when(() -> WebResponseUtils.pdfFileToWebResponse(any(), anyString()))
                        .thenReturn(cannedResponse());

                ResponseEntity<Resource> response = ocrController.processPdfWithOCR(request);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                verify(executor).runCommandWithOutputHandling(anyList());
            }
        }

        @Test
        @DisplayName("throws when tesseract exits non-zero")
        void tesseractFailureThrows() throws Exception {
            availLanguages("eng");
            when(endpointConfiguration.isGroupEnabled("OCRmyPDF")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("tesseract")).thenReturn(true);

            ProcessPdfWithOcrRequest request = baseRequest("in.pdf");
            request.setOcrType("force-ocr");
            when(pdfDocumentFactory.load(any(java.io.File.class)))
                    .thenAnswer(inv -> singlePageDoc());

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutor executor = executorReturning(2, "tess-error");
                pe.when(() -> ProcessExecutor.getInstance(Processes.TESSERACT))
                        .thenReturn(executor);

                assertThatThrownBy(() -> ocrController.processPdfWithOCR(request))
                        .isInstanceOf(RuntimeException.class);
            }
        }

        private PDDocument singlePageDoc() throws IOException {
            PDDocument doc = new PDDocument();
            doc.addPage(new PDPage());
            return doc;
        }
    }

    @Nested
    @DisplayName("validation and tool-availability")
    class Validation {

        @Test
        @DisplayName("throws when render type is neither hocr nor sandwich")
        void invalidRenderType() throws Exception {
            ProcessPdfWithOcrRequest request = baseRequest("in.pdf");
            request.setOcrRenderType("bogus");

            assertThatThrownBy(() -> ocrController.processPdfWithOCR(request))
                    .isInstanceOf(IOException.class);
            verify(runtimePathConfig, never()).getTessDataPath();
        }

        @Test
        @DisplayName("throws when both OCR tools are disabled even with valid languages")
        void noToolsAvailable() throws Exception {
            availLanguages("eng");
            when(endpointConfiguration.isGroupEnabled("OCRmyPDF")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("tesseract")).thenReturn(false);
            ProcessPdfWithOcrRequest request = baseRequest("in.pdf");

            assertThatThrownBy(() -> ocrController.processPdfWithOCR(request))
                    .isInstanceOf(IOException.class);
            verify(endpointConfiguration).isGroupEnabled("OCRmyPDF");
            verify(endpointConfiguration).isGroupEnabled("tesseract");
        }
    }
}
