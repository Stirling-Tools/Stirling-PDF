package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
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
import org.springframework.web.server.ResponseStatusException;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.misc.OptimizePdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.LineArtConversionService;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

/**
 * Unit tests for {@link CompressController}. External binaries (Ghostscript / qpdf / ImageMagick)
 * are never invoked: tests cover validation, orchestration with all tool groups disabled, the pure
 * level/quality helpers, and the public image-compression entry point.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CompressControllerTest {

    @TempDir Path tempDir;

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private CompressController controller;

    /** Real temp files created during a test; cleaned up after each test. */
    private final List<File> createdFiles = new ArrayList<>();

    @BeforeEach
    void setUp() throws Exception {
        // By default no external tools are enabled, forcing the Java-only path.
        lenient().when(endpointConfiguration.isGroupEnabled(anyString())).thenReturn(false);

        // Every managed temp file is backed by a real on-disk file wrapped in a mock TempFile.
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile(
                                                    "compress-test", inv.<String>getArgument(0))
                                            .toFile();
                            createdFiles.add(f);
                            return newRealBackedTempFile(f);
                        });
    }

    private TempFile newRealBackedTempFile(File f) {
        TempFile tf = mock(TempFile.class);
        lenient().when(tf.getFile()).thenReturn(f);
        lenient().when(tf.getPath()).thenReturn(f.toPath());
        lenient().when(tf.getAbsolutePath()).thenReturn(f.getAbsolutePath());
        lenient().when(tf.exists()).thenReturn(f.exists());
        return tf;
    }

    // ----- helpers to build tiny in-memory PDFs ------------------------------------------------

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
                cs.showText("Hello compress");
                cs.endText();
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    /** PDF with one tiny (sub-400px) image so the compressor encounters it but skips it. */
    private byte[] smallImagePdfBytes() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            doc.addPage(page);
            java.awt.image.BufferedImage img =
                    new java.awt.image.BufferedImage(
                            50, 50, java.awt.image.BufferedImage.TYPE_INT_RGB);
            for (int x = 0; x < 50; x++) {
                for (int y = 0; y < 50; y++) {
                    img.setRGB(x, y, (x * 5 + y) & 0xFFFFFF);
                }
            }
            PDImageXObject image = LosslessFactory.createFromImage(doc, img);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.drawImage(image, 100, 100, 50, 50);
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
        try (InputStream in = response.getBody().getInputStream()) {
            in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    // ----- validation branches -----------------------------------------------------------------

    @Nested
    @DisplayName("optimizePdf validation")
    class Validation {

        @Test
        @DisplayName("null input file throws IllegalArgumentException")
        void nullFile_throws() {
            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(null);

            assertThatThrownBy(() -> controller.optimizePdf(request))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("empty input file throws IllegalArgumentException")
        void emptyFile_throws() {
            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(
                    new MockMultipartFile(
                            "fileInput",
                            "input.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            new byte[0]));

            assertThatThrownBy(() -> controller.optimizePdf(request))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName(
                "both optimizeLevel and expectedOutputSize null throws IllegalArgumentException")
        void noOptionsProvided_throws() throws Exception {
            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(textOnlyPdfBytes()));
            request.setOptimizeLevel(null);
            request.setExpectedOutputSize(null);

            assertThatThrownBy(() -> controller.optimizePdf(request))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("line art requested but service unavailable throws FORBIDDEN")
        void lineArt_serviceNull_throwsForbidden() throws Exception {
            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(textOnlyPdfBytes()));
            request.setOptimizeLevel(2);
            request.setLineArt(true);

            // lineArtConversionService field is left null by @InjectMocks.
            assertThatThrownBy(() -> controller.optimizePdf(request))
                    .isInstanceOf(ResponseStatusException.class)
                    .extracting(e -> ((ResponseStatusException) e).getStatusCode())
                    .isEqualTo(HttpStatus.FORBIDDEN);
        }

        @Test
        @DisplayName(
                "line art requested with service present but ImageMagick disabled throws IOException")
        void lineArt_imageMagickDisabled_throwsIOException() throws Exception {
            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(textOnlyPdfBytes()));
            request.setOptimizeLevel(2);
            request.setLineArt(true);

            // Provide a service so the null-check passes, but ImageMagick group stays disabled.
            setLineArtService(mock(LineArtConversionService.class));
            when(endpointConfiguration.isGroupEnabled("ImageMagick")).thenReturn(false);

            assertThatThrownBy(() -> controller.optimizePdf(request))
                    .isInstanceOf(IOException.class);
        }
    }

    // ----- orchestration with all external tools disabled --------------------------------------

    @Nested
    @DisplayName("optimizePdf orchestration (no external tools)")
    class Orchestration {

        @Test
        @DisplayName("low level + no tools returns OK with non-empty body")
        void lowLevel_noTools_returnsOk() throws Exception {
            byte[] pdf = textOnlyPdfBytes();
            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(pdf));
            request.setOptimizeLevel(1); // < 4 => no image compression, < 6 => no ghostscript

            // Final stage reloads currentFile from disk; return a fresh real document.
            when(pdfDocumentFactory.load(any(File.class)))
                    .thenAnswer(inv -> Loader.loadPDF((File) inv.getArgument(0)));

            ResponseEntity<Resource> response = controller.optimizePdf(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drain(response)).isNotEmpty();
        }

        @Test
        @DisplayName("level 4 with a sub-threshold image still returns OK (image skipped)")
        void level4_smallImage_skipped_returnsOk() throws Exception {
            byte[] pdf = smallImagePdfBytes();
            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(pdf));
            request.setOptimizeLevel(4); // triggers Java image compression path

            when(pdfDocumentFactory.load(any(File.class)))
                    .thenAnswer(inv -> Loader.loadPDF((File) inv.getArgument(0)));
            // compressImagesInPDF reloads currentFile via load(Path).
            when(pdfDocumentFactory.load(any(Path.class)))
                    .thenAnswer(inv -> Loader.loadPDF(((Path) inv.getArgument(0)).toFile()));

            ResponseEntity<Resource> response = controller.optimizePdf(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drain(response)).isNotEmpty();
        }

        @Test
        @DisplayName("grayscale flag forces image compression path even at low level")
        void grayscale_lowLevel_returnsOk() throws Exception {
            byte[] pdf = textOnlyPdfBytes();
            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(pdf));
            request.setOptimizeLevel(1);
            request.setGrayscale(true);

            when(pdfDocumentFactory.load(any(File.class)))
                    .thenAnswer(inv -> Loader.loadPDF((File) inv.getArgument(0)));
            when(pdfDocumentFactory.load(any(Path.class)))
                    .thenAnswer(inv -> Loader.loadPDF(((Path) inv.getArgument(0)).toFile()));

            ResponseEntity<Resource> response = controller.optimizePdf(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drain(response)).isNotEmpty();
        }

        @Test
        @DisplayName("auto mode via expectedOutputSize picks a level and returns OK")
        void autoMode_expectedOutputSize_returnsOk() throws Exception {
            byte[] pdf = textOnlyPdfBytes();
            OptimizePdfRequest request = new OptimizePdfRequest();
            request.setFileInput(multipart(pdf));
            request.setOptimizeLevel(null);
            request.setExpectedOutputSize("1KB"); // length > 1 => auto mode

            when(pdfDocumentFactory.load(any(File.class)))
                    .thenAnswer(inv -> Loader.loadPDF((File) inv.getArgument(0)));
            when(pdfDocumentFactory.load(any(Path.class)))
                    .thenAnswer(inv -> Loader.loadPDF(((Path) inv.getArgument(0)).toFile()));

            ResponseEntity<Resource> response = controller.optimizePdf(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(drain(response)).isNotEmpty();
        }
    }

    // ----- public compressImagesInPDF ----------------------------------------------------------

    @Nested
    @DisplayName("compressImagesInPDF")
    class CompressImages {

        @Test
        @DisplayName("PDF with a tiny image produces a valid, non-empty output PDF")
        void smallImage_producesValidPdf() throws Exception {
            Path src = tempDir.resolve("src.pdf");
            Files.write(src, smallImagePdfBytes());

            when(pdfDocumentFactory.load(any(Path.class)))
                    .thenAnswer(inv -> Loader.loadPDF(((Path) inv.getArgument(0)).toFile()));

            TempFile result = controller.compressImagesInPDF(src, 0.5, 0.5f, false);

            assertThat(result).isNotNull();
            byte[] out = Files.readAllBytes(result.getPath());
            assertThat(out).isNotEmpty();
            try (PDDocument doc = Loader.loadPDF(out)) {
                assertThat(doc.getNumberOfPages()).isEqualTo(1);
            }
        }

        @Test
        @DisplayName("text-only PDF compresses to a valid single-page output")
        void textOnly_producesValidPdf() throws Exception {
            Path src = tempDir.resolve("text.pdf");
            Files.write(src, textOnlyPdfBytes());

            when(pdfDocumentFactory.load(any(Path.class)))
                    .thenAnswer(inv -> Loader.loadPDF(((Path) inv.getArgument(0)).toFile()));

            TempFile result = controller.compressImagesInPDF(src, 0.8, 0.7f, false);

            assertThat(result).isNotNull();
            try (PDDocument doc = Loader.loadPDF(Files.readAllBytes(result.getPath()))) {
                assertThat(doc.getNumberOfPages()).isEqualTo(1);
            }
        }

        @Test
        @DisplayName("load failure closes the temp file and propagates the exception")
        void loadFailure_propagates() throws Exception {
            Path src = tempDir.resolve("bad.pdf");
            Files.write(src, textOnlyPdfBytes());

            when(pdfDocumentFactory.load(any(Path.class))).thenThrow(new IOException("boom"));

            assertThatThrownBy(() -> controller.compressImagesInPDF(src, 0.5, 0.5f, false))
                    .isInstanceOf(IOException.class)
                    .hasMessageContaining("boom");
        }
    }

    // ----- pure helper methods (reflection) ----------------------------------------------------

    @Nested
    @DisplayName("scale / quality / level helpers")
    class Helpers {

        @Test
        @DisplayName("getScaleFactorForLevel maps each level and defaults to 1.0")
        void scaleFactorForLevel() throws Exception {
            Method m = privateStatic("getScaleFactorForLevel", int.class);
            assertThat((double) m.invoke(null, 1)).isEqualTo(0.98);
            assertThat((double) m.invoke(null, 5)).isEqualTo(0.68);
            assertThat((double) m.invoke(null, 9)).isEqualTo(0.28);
            // Out-of-range falls to the default branch.
            assertThat((double) m.invoke(null, 0)).isEqualTo(1.0);
            assertThat((double) m.invoke(null, 42)).isEqualTo(1.0);
        }

        @Test
        @DisplayName("getJpegQualityForLevel maps each level and defaults to 0.75")
        void jpegQualityForLevel() throws Exception {
            Method m = privateStatic("getJpegQualityForLevel", int.class);
            assertThat((float) m.invoke(null, 1)).isEqualTo(0.92f);
            assertThat((float) m.invoke(null, 9)).isEqualTo(0.35f);
            assertThat((float) m.invoke(null, 0)).isEqualTo(0.75f);
            assertThat((float) m.invoke(null, 100)).isEqualTo(0.75f);
        }

        @Test
        @DisplayName("determineOptimizeLevel buckets the size-reduction ratio")
        void determineOptimizeLevel() throws Exception {
            Method m = privateStatic("determineOptimizeLevel", double.class);
            assertThat((int) m.invoke(null, 0.95)).isEqualTo(1);
            assertThat((int) m.invoke(null, 0.85)).isEqualTo(2);
            assertThat((int) m.invoke(null, 0.75)).isEqualTo(3);
            assertThat((int) m.invoke(null, 0.65)).isEqualTo(4);
            assertThat((int) m.invoke(null, 0.5)).isEqualTo(5);
            assertThat((int) m.invoke(null, 0.25)).isEqualTo(6);
            assertThat((int) m.invoke(null, 0.18)).isEqualTo(7);
            assertThat((int) m.invoke(null, 0.12)).isEqualTo(8);
            assertThat((int) m.invoke(null, 0.05)).isEqualTo(9);
        }

        @Test
        @DisplayName("incrementOptimizeLevel grows by ratio and is capped at 9")
        void incrementOptimizeLevel() throws Exception {
            Method m = privateStatic("incrementOptimizeLevel", int.class, long.class, long.class);
            // ratio 3.0 (> 2.0) -> +3
            assertThat((int) m.invoke(null, 2, 300L, 100L)).isEqualTo(5);
            // ratio 1.8 (> 1.5) -> +2
            assertThat((int) m.invoke(null, 2, 180L, 100L)).isEqualTo(4);
            // ratio 1.1 -> +1
            assertThat((int) m.invoke(null, 2, 110L, 100L)).isEqualTo(3);
            // capped at 9
            assertThat((int) m.invoke(null, 8, 300L, 100L)).isEqualTo(9);
        }

        @Test
        @DisplayName("getImageType classifies filters; unknown for non-image input")
        void getImageType_andFilter() throws Exception {
            // A PNG-style lossless image yields FlateDecode -> "PNG".
            try (PDDocument doc = new PDDocument()) {
                java.awt.image.BufferedImage bi =
                        new java.awt.image.BufferedImage(
                                10, 10, java.awt.image.BufferedImage.TYPE_INT_RGB);
                PDImageXObject image = LosslessFactory.createFromImage(doc, bi);

                Method typeMethod = privateStatic("getImageType", PDImageXObject.class);
                String type = (String) typeMethod.invoke(null, image);
                assertThat(type).isEqualTo("PNG");

                Method filterMethod = privateStatic("getImageFilter", PDImageXObject.class);
                String filter = (String) filterMethod.invoke(null, image);
                assertThat(filter).contains("FlateDecode");
            }
        }
    }

    // ----- reflection / field helpers ----------------------------------------------------------

    private static Method privateStatic(String name, Class<?>... params) throws Exception {
        Method m = CompressController.class.getDeclaredMethod(name, params);
        m.setAccessible(true);
        return m;
    }

    private void setLineArtService(LineArtConversionService service) throws Exception {
        Field f = CompressController.class.getDeclaredField("lineArtConversionService");
        f.setAccessible(true);
        f.set(controller, service);
    }
}
