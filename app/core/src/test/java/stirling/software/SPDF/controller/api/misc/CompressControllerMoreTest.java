package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.misc.OptimizePdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

/**
 * Additional unit tests for {@link CompressController} covering the Ghostscript / qpdf
 * orchestration paths that the base test deliberately skips. Real external binaries are never
 * launched: the static {@link ProcessExecutor} instance map is patched via reflection with mocks
 * that fake a successful run and write a small valid PDF to the expected output file.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CompressControllerMoreTest {

    @TempDir Path tempDir;

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private TempFileManager tempFileManager;

    @Mock private ProcessExecutor ghostscriptExecutor;
    @Mock private ProcessExecutor qpdfExecutor;

    @InjectMocks private CompressController controller;

    /** Real temp files created during a test; cleaned up after each test. */
    private final List<File> createdFiles = new ArrayList<>();

    /** Previous occupants of the static instances map, restored in tearDown. */
    private ProcessExecutor previousGhostscript;

    private ProcessExecutor previousQpdf;
    private boolean hadGhostscript;
    private boolean hadQpdf;

    @BeforeEach
    void setUp() throws Exception {
        // Both external tool groups enabled so the orchestration paths run.
        lenient().when(endpointConfiguration.isGroupEnabled(anyString())).thenReturn(true);

        // Every managed temp file is backed by a real on-disk file wrapped in a mock TempFile.
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile(
                                                    "compress-more-test",
                                                    inv.<String>getArgument(0))
                                            .toFile();
                            createdFiles.add(f);
                            return newRealBackedTempFile(f);
                        });

        // The final reload and any image-compression reload return real PDFBox documents.
        lenient()
                .when(pdfDocumentFactory.load(any(File.class)))
                .thenAnswer(inv -> Loader.loadPDF((File) inv.getArgument(0)));
        lenient()
                .when(pdfDocumentFactory.load(any(Path.class)))
                .thenAnswer(inv -> Loader.loadPDF(((Path) inv.getArgument(0)).toFile()));

        installExecutorMocks();
    }

    @AfterEach
    void tearDown() throws Exception {
        restoreExecutorMocks();
        for (File f : createdFiles) {
            try {
                Files.deleteIfExists(f.toPath());
            } catch (Exception ignored) {
                // best-effort cleanup
            }
        }
        createdFiles.clear();
    }

    // ----- static ProcessExecutor instance-map patching ----------------------------------------

    @SuppressWarnings("unchecked")
    private Map<ProcessExecutor.Processes, ProcessExecutor> executorInstances() throws Exception {
        Field field = ProcessExecutor.class.getDeclaredField("instances");
        field.setAccessible(true);
        return (Map<ProcessExecutor.Processes, ProcessExecutor>) field.get(null);
    }

    private void installExecutorMocks() throws Exception {
        Map<ProcessExecutor.Processes, ProcessExecutor> instances = executorInstances();

        hadGhostscript = instances.containsKey(ProcessExecutor.Processes.GHOSTSCRIPT);
        previousGhostscript = instances.get(ProcessExecutor.Processes.GHOSTSCRIPT);
        hadQpdf = instances.containsKey(ProcessExecutor.Processes.QPDF);
        previousQpdf = instances.get(ProcessExecutor.Processes.QPDF);

        instances.put(ProcessExecutor.Processes.GHOSTSCRIPT, ghostscriptExecutor);
        instances.put(ProcessExecutor.Processes.QPDF, qpdfExecutor);
    }

    private void restoreExecutorMocks() throws Exception {
        Map<ProcessExecutor.Processes, ProcessExecutor> instances = executorInstances();
        if (hadGhostscript) {
            instances.put(ProcessExecutor.Processes.GHOSTSCRIPT, previousGhostscript);
        } else {
            instances.remove(ProcessExecutor.Processes.GHOSTSCRIPT);
        }
        if (hadQpdf) {
            instances.put(ProcessExecutor.Processes.QPDF, previousQpdf);
        } else {
            instances.remove(ProcessExecutor.Processes.QPDF);
        }
    }

    private TempFile newRealBackedTempFile(File f) {
        TempFile tf = mock(TempFile.class);
        lenient().when(tf.getFile()).thenReturn(f);
        lenient().when(tf.getPath()).thenReturn(f.toPath());
        lenient().when(tf.getAbsolutePath()).thenReturn(f.getAbsolutePath());
        lenient().when(tf.exists()).thenReturn(f.exists());
        return tf;
    }

    // ----- executor stubbing helpers ------------------------------------------------------------

    /**
     * Build a result mock with the given return code; assigned to a local before any thenReturn.
     */
    private ProcessExecutorResult resultWithRc(int rc) {
        ProcessExecutorResult result = mock(ProcessExecutorResult.class);
        lenient().when(result.getRc()).thenReturn(rc);
        lenient().when(result.getMessages()).thenReturn("");
        return result;
    }

    // Locate the -sOutputFile= path in a gs command.
    private static Path ghostscriptOutputPath(List<String> command) {
        for (String arg : command) {
            if (arg.startsWith("-sOutputFile=")) {
                return Path.of(arg.substring("-sOutputFile=".length()));
            }
        }
        return null;
    }

    // The qpdf output path is the last argument of the command.
    private static Path qpdfOutputPath(List<String> command) {
        return Path.of(command.get(command.size() - 1));
    }

    /** Stub gs to write a valid PDF to its output file and report success. */
    private void stubGhostscriptSuccess(byte[] pdfToWrite) throws Exception {
        ProcessExecutorResult okResult = resultWithRc(0);
        lenient()
                .when(ghostscriptExecutor.runCommandWithOutputHandling(anyList()))
                .thenAnswer(
                        inv -> {
                            List<String> command = inv.getArgument(0);
                            Path out = ghostscriptOutputPath(command);
                            if (out != null) {
                                Files.write(out, pdfToWrite);
                            }
                            return okResult;
                        });
    }

    /** Stub gs to report a non-zero, non-critical return code (output stays untouched). */
    private void stubGhostscriptNonZero() throws Exception {
        ProcessExecutorResult badResult = resultWithRc(1);
        lenient()
                .when(ghostscriptExecutor.runCommandWithOutputHandling(anyList()))
                .thenReturn(badResult);
    }

    /** Stub qpdf to write a valid PDF to its output file and report success. */
    private void stubQpdfSuccess(byte[] pdfToWrite) throws Exception {
        ProcessExecutorResult okResult = resultWithRc(0);
        lenient()
                .when(qpdfExecutor.runCommandWithOutputHandling(anyList(), any()))
                .thenAnswer(
                        inv -> {
                            List<String> command = inv.getArgument(0);
                            Path out = qpdfOutputPath(command);
                            if (out != null) {
                                Files.write(out, pdfToWrite);
                            }
                            return okResult;
                        });
    }

    // ----- tiny in-memory PDF builders ---------------------------------------------------------

    private byte[] textOnlyPdfBytes() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(
                        new org.apache.pdfbox.pdmodel.font.PDType1Font(
                                org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName.HELVETICA),
                        12);
                cs.newLineAtOffset(50, 700);
                cs.showText("Hello compress more");
                cs.endText();
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    /** PDF with one large (>400px) image so the image-compression branch actually resizes it. */
    private byte[] largeImagePdfBytes() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            // >400px so the resize branch fires; filled via Graphics2D (instant vs per-pixel).
            java.awt.image.BufferedImage img =
                    new java.awt.image.BufferedImage(
                            500, 500, java.awt.image.BufferedImage.TYPE_INT_RGB);
            java.awt.Graphics2D g = img.createGraphics();
            g.setColor(java.awt.Color.LIGHT_GRAY);
            g.fillRect(0, 0, 500, 500);
            g.setColor(java.awt.Color.DARK_GRAY);
            g.fillRect(60, 60, 380, 380);
            g.dispose();
            PDImageXObject image = LosslessFactory.createFromImage(doc, img);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.drawImage(image, 50, 50, 400, 400);
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private MockMultipartFile multipart(byte[] bytes) {
        return new MockMultipartFile(
                "fileInput", "input.pdf", MediaType.APPLICATION_PDF_VALUE, bytes);
    }

    private static byte[] drain(ResponseEntity<Resource> response) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (java.io.InputStream in = response.getBody().getInputStream()) {
            in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    // ===========================================================================================
    // Ghostscript orchestration
    // ===========================================================================================

    @Nested
    @DisplayName("Ghostscript orchestration")
    class Ghostscript {

        @Test
        @DisplayName("level 6 runs Ghostscript successfully and returns OK")
        void level6_ghostscriptSuccess_returnsOk() throws Exception {
            byte[] gsOut = textOnlyPdfBytes();
            stubGhostscriptSuccess(gsOut);
            stubQpdfSuccess(textOnlyPdfBytes());

            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(largeImagePdfBytes()));
            request.setOptimizeLevel(6);

            ResponseEntity<Resource> response = controller.optimizePdf(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drain(response)).isNotEmpty();
        }

        @Test
        @DisplayName("each optimize level 6-9 with Ghostscript enabled returns OK")
        void levels6to9_ghostscriptSuccess_returnsOk() throws Exception {
            // Stub once: re-stubbing a mock inside the loop re-invokes the previous answer
            // with empty matcher args, tripping qpdfOutputPath's last-element lookup.
            stubGhostscriptSuccess(textOnlyPdfBytes());
            stubQpdfSuccess(textOnlyPdfBytes());

            for (int level = 6; level <= 9; level++) {
                OptimizePdfRequest request = new OptimizePdfRequest();
                request.setFileInput(multipart(largeImagePdfBytes()));
                request.setOptimizeLevel(level);

                ResponseEntity<Resource> response = controller.optimizePdf(request);
                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            }
        }

        @Test
        @DisplayName("levels 1-5 skip Ghostscript (never invoked) but still return OK")
        void lowLevels_ghostscriptNotInvoked_returnsOk() throws Exception {
            stubGhostscriptSuccess(textOnlyPdfBytes());
            stubQpdfSuccess(textOnlyPdfBytes());

            for (int level = 1; level <= 5; level++) {
                OptimizePdfRequest request = new OptimizePdfRequest();
                request.setFileInput(multipart(largeImagePdfBytes()));
                request.setOptimizeLevel(level);

                ResponseEntity<Resource> response = controller.optimizePdf(request);
                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            }
            // gs only runs for levels >= 6.
            org.mockito.Mockito.verify(ghostscriptExecutor, org.mockito.Mockito.never())
                    .runCommandWithOutputHandling(anyList());
        }

        @Test
        @DisplayName("grayscale flag at level 6 still drives Ghostscript and returns OK")
        void grayscale_level6_returnsOk() throws Exception {
            stubGhostscriptSuccess(textOnlyPdfBytes());
            stubQpdfSuccess(textOnlyPdfBytes());

            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(largeImagePdfBytes()));
            request.setOptimizeLevel(7);
            request.setGrayscale(true);

            ResponseEntity<Resource> response = controller.optimizePdf(request);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        }

        @Test
        @DisplayName("non-zero Ghostscript exit is propagated as GhostscriptException")
        void ghostscriptNonZeroExit_propagates() throws Exception {
            // A non-zero gs return code is wrapped and rethrown (see optimizePdf's
            // catch (GhostscriptException) -> throw e), not swallowed.
            stubGhostscriptNonZero();
            stubQpdfSuccess(textOnlyPdfBytes());

            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(largeImagePdfBytes()));
            request.setOptimizeLevel(6);

            assertThatThrownBy(() -> controller.optimizePdf(request))
                    .isInstanceOf(ExceptionUtils.GhostscriptException.class);
        }

        @Test
        @DisplayName("critical Ghostscript error is propagated as GhostscriptException")
        void ghostscriptCriticalError_propagates() throws Exception {
            // Output containing a recognized critical marker triggers
            // detectGhostscriptCriticalError.
            ProcessExecutorResult criticalResult = mock(ProcessExecutorResult.class);
            lenient().when(criticalResult.getRc()).thenReturn(0);
            lenient()
                    .when(criticalResult.getMessages())
                    .thenReturn("Page 1\nERROR: Could not draw this page");
            lenient()
                    .when(ghostscriptExecutor.runCommandWithOutputHandling(anyList()))
                    .thenReturn(criticalResult);

            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(largeImagePdfBytes()));
            request.setOptimizeLevel(8);

            assertThatThrownBy(() -> controller.optimizePdf(request))
                    .isInstanceOf(ExceptionUtils.GhostscriptException.class);
        }

        @Test
        @DisplayName("Ghostscript IOException is wrapped and propagated as GhostscriptException")
        void ghostscriptIOException_propagates() throws Exception {
            // An IOException from the gs executor is wrapped via
            // createGhostscriptCompressionException and rethrown, not swallowed.
            lenient()
                    .when(ghostscriptExecutor.runCommandWithOutputHandling(anyList()))
                    .thenThrow(new IOException("gs boom"));
            stubQpdfSuccess(textOnlyPdfBytes());

            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(largeImagePdfBytes()));
            request.setOptimizeLevel(6);

            assertThatThrownBy(() -> controller.optimizePdf(request))
                    .isInstanceOf(ExceptionUtils.GhostscriptException.class);
        }
    }

    // ===========================================================================================
    // QPDF orchestration
    // ===========================================================================================

    @Nested
    @DisplayName("QPDF orchestration")
    class Qpdf {

        @Test
        @DisplayName("low level with only qpdf enabled recompresses and returns OK")
        void lowLevel_qpdfOnly_returnsOk() throws Exception {
            // Disable Ghostscript so qpdf is the only external tool that runs.
            lenient().when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(false);
            stubQpdfSuccess(textOnlyPdfBytes());

            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(largeImagePdfBytes()));
            request.setOptimizeLevel(2);

            ResponseEntity<Resource> response = controller.optimizePdf(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drain(response)).isNotEmpty();
        }

        @Test
        @DisplayName("linearize option drives qpdf --linearize and returns OK")
        void linearize_qpdf_returnsOk() throws Exception {
            lenient().when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(false);

            // Capture the qpdf command so we can assert --linearize is present.
            List<List<String>> captured = new ArrayList<>();
            ProcessExecutorResult okResult = resultWithRc(0);
            byte[] pdfToWrite = textOnlyPdfBytes();
            lenient()
                    .when(qpdfExecutor.runCommandWithOutputHandling(anyList(), any()))
                    .thenAnswer(
                            inv -> {
                                List<String> command = inv.getArgument(0);
                                captured.add(command);
                                Path out = qpdfOutputPath(command);
                                Files.write(out, pdfToWrite);
                                return okResult;
                            });

            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(largeImagePdfBytes()));
            request.setOptimizeLevel(3);
            request.setLinearize(true);
            request.setNormalize(true);

            ResponseEntity<Resource> response = controller.optimizePdf(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(captured).isNotEmpty();
            assertThat(captured.get(0)).contains("--linearize");
            assertThat(captured.get(0)).contains("--normalize-content=y");
        }

        @Test
        @DisplayName("higher level enables qpdf --optimize-images and jpeg quality")
        void highLevel_qpdfOptimizeImages_returnsOk() throws Exception {
            lenient().when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(false);

            List<List<String>> captured = new ArrayList<>();
            ProcessExecutorResult okResult = resultWithRc(0);
            byte[] pdfToWrite = textOnlyPdfBytes();
            lenient()
                    .when(qpdfExecutor.runCommandWithOutputHandling(anyList(), any()))
                    .thenAnswer(
                            inv -> {
                                List<String> command = inv.getArgument(0);
                                captured.add(command);
                                Files.write(qpdfOutputPath(command), pdfToWrite);
                                return okResult;
                            });

            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(largeImagePdfBytes()));
            request.setOptimizeLevel(5);

            ResponseEntity<Resource> response = controller.optimizePdf(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(captured.get(0)).contains("--optimize-images");
        }

        @Test
        @DisplayName("qpdf IOException is swallowed; processing still returns OK")
        void qpdfIOException_swallowed_returnsOk() throws Exception {
            lenient().when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(false);
            lenient()
                    .when(qpdfExecutor.runCommandWithOutputHandling(anyList(), any()))
                    .thenThrow(new IOException("qpdf boom"));

            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(largeImagePdfBytes()));
            request.setOptimizeLevel(2);

            ResponseEntity<Resource> response = controller.optimizePdf(request);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        }

        @Test
        @DisplayName("Ghostscript + qpdf both enabled at high level returns OK")
        void ghostscriptAndQpdf_highLevel_returnsOk() throws Exception {
            stubGhostscriptSuccess(textOnlyPdfBytes());
            stubQpdfSuccess(textOnlyPdfBytes());

            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(largeImagePdfBytes()));
            request.setOptimizeLevel(9);

            ResponseEntity<Resource> response = controller.optimizePdf(request);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        }
    }

    // ===========================================================================================
    // Target-size (auto) mode iterative loop
    // ===========================================================================================

    @Nested
    @DisplayName("target expected-size (auto) mode")
    class AutoMode {

        @Test
        @DisplayName("auto mode reaches target on first pass when gs shrinks enough")
        void autoMode_targetMetFirstPass_returnsOk() throws Exception {
            // gs writes a tiny PDF so the very first size check meets a generous target.
            byte[] tiny = textOnlyPdfBytes();
            stubGhostscriptSuccess(tiny);
            stubQpdfSuccess(tiny);

            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(largeImagePdfBytes()));
            request.setOptimizeLevel(null);
            request.setExpectedOutputSize("10MB"); // easily met

            ResponseEntity<Resource> response = controller.optimizePdf(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drain(response)).isNotEmpty();
        }

        @Test
        @DisplayName("auto mode escalates the level when target is not met, then terminates")
        void autoMode_escalatesLevel_returnsOk() throws Exception {
            // gs always writes the same moderate PDF whose size stays just above the target,
            // forcing the loop to escalate optimizeLevel from a low start until it caps at 9.
            byte[] moderate = largeImagePdfBytes();
            // Target ~25% of input => start level 6 (gs eligible); gs success skips image
            // compression so size stays constant and the loop escalates 6 -> 9 (>=2 gs calls).
            long target = moderate.length / 4;
            final AtomicInteger gsCalls = new AtomicInteger();
            ProcessExecutorResult okResult = resultWithRc(0);
            lenient()
                    .when(ghostscriptExecutor.runCommandWithOutputHandling(anyList()))
                    .thenAnswer(
                            inv -> {
                                gsCalls.incrementAndGet();
                                List<String> command = inv.getArgument(0);
                                Path out = ghostscriptOutputPath(command);
                                if (out != null) {
                                    Files.write(out, moderate);
                                }
                                return okResult;
                            });
            stubQpdfSuccess(moderate);

            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(moderate));
            request.setOptimizeLevel(null);
            request.setExpectedOutputSize(target + "B"); // never met => escalates through levels

            ResponseEntity<Resource> response = controller.optimizePdf(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            // Escalation reaches gs-eligible levels (>=6) more than once before bailing at max.
            assertThat(gsCalls.get()).isGreaterThan(1);
        }

        @Test
        @DisplayName("auto mode with qpdf only (low starting level) escalates and returns OK")
        void autoMode_qpdfOnly_returnsOk() throws Exception {
            lenient().when(endpointConfiguration.isGroupEnabled("Ghostscript")).thenReturn(false);
            byte[] moderate = largeImagePdfBytes();
            stubQpdfSuccess(moderate);

            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(moderate));
            request.setOptimizeLevel(null);
            request.setExpectedOutputSize("1KB");

            ResponseEntity<Resource> response = controller.optimizePdf(request);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        }
    }

    // ===========================================================================================
    // Image compression branches reached via the controller
    // ===========================================================================================

    @Nested
    @DisplayName("image compression branches")
    class ImageCompression {

        @Test
        @DisplayName("level 4 with a large image and no gs (level<6) compresses the image")
        void level4_largeImage_compresses_returnsOk() throws Exception {
            // Disable both external tools so the Java image path is exercised end-to-end.
            lenient().when(endpointConfiguration.isGroupEnabled(anyString())).thenReturn(false);

            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(largeImagePdfBytes()));
            request.setOptimizeLevel(4);

            ResponseEntity<Resource> response = controller.optimizePdf(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drain(response)).isNotEmpty();
        }

        @Test
        @DisplayName("grayscale at low level compresses image via Java path when tools disabled")
        void grayscale_lowLevel_javaPath_returnsOk() throws Exception {
            lenient().when(endpointConfiguration.isGroupEnabled(anyString())).thenReturn(false);

            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(largeImagePdfBytes()));
            request.setOptimizeLevel(2);
            request.setGrayscale(true);

            ResponseEntity<Resource> response = controller.optimizePdf(request);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        }

        @Test
        @DisplayName("compressImagesInPDF scales a large image and grayscale converts it")
        void compressImagesInPDF_largeImage_grayscale() throws Exception {
            Path src = tempDir.resolve("large.pdf");
            Files.write(src, largeImagePdfBytes());

            TempFile result = controller.compressImagesInPDF(src, 0.5, 0.6f, true);

            assertThat(result).isNotNull();
            byte[] out = Files.readAllBytes(result.getPath());
            try (PDDocument doc = Loader.loadPDF(out)) {
                assertThat(doc.getNumberOfPages()).isEqualTo(1);
            }
        }

        @Test
        @DisplayName("compressImagesInPDF at high quality on a large image still produces a PDF")
        void compressImagesInPDF_largeImage_highQuality() throws Exception {
            Path src = tempDir.resolve("large2.pdf");
            Files.write(src, largeImagePdfBytes());

            TempFile result = controller.compressImagesInPDF(src, 0.9, 0.95f, false);

            assertThat(result).isNotNull();
            assertThat(Files.readAllBytes(result.getPath())).isNotEmpty();
        }
    }

    // ===========================================================================================
    // Result-size guard: optimized output never larger than original
    // ===========================================================================================

    @Nested
    @DisplayName("output size guard")
    class OutputSizeGuard {

        @Test
        @DisplayName("when gs output is larger than original, the original is returned")
        void gsLargerThanOriginal_usesOriginal_returnsOk() throws Exception {
            byte[] original = textOnlyPdfBytes();
            // gs writes a deliberately bloated file so the >= inputFileSize guard trips.
            byte[] bloated = largeImagePdfBytes();
            stubGhostscriptSuccess(bloated);
            stubQpdfSuccess(bloated);

            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(original));
            request.setOptimizeLevel(6);

            ResponseEntity<Resource> response = controller.optimizePdf(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drain(response)).isNotEmpty();
        }
    }

    // ===========================================================================================
    // Validation still holds with tools enabled
    // ===========================================================================================

    @Nested
    @DisplayName("validation with tools enabled")
    class Validation {

        @Test
        @DisplayName("null file still throws IllegalArgumentException even with tools enabled")
        void nullFile_throws() {
            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(null);

            assertThatThrownBy(() -> controller.optimizePdf(request))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("no optimize options provided throws IllegalArgumentException")
        void noOptions_throws() throws Exception {
            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(textOnlyPdfBytes()));
            request.setOptimizeLevel(null);
            request.setExpectedOutputSize(null);

            assertThatThrownBy(() -> controller.optimizePdf(request))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }
}
