package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.MediaType;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

/**
 * Unit tests for {@link ConvertPdfToVideoController}.
 *
 * <p>The public {@code convertPdfToVideo} endpoint is commented out in production (ffmpeg disabled
 * due to CVEs), so these tests exercise the remaining private helper methods directly via
 * reflection. No external processes (ffmpeg) are ever spawned: {@code buildFfmpegCommand} only
 * constructs the argument list, and {@code generateFrames} renders PDF pages to PNG files on disk.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ConvertPdfToVideoControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    private ConvertPdfToVideoController controller;

    @BeforeEach
    void setUp() {
        controller = new ConvertPdfToVideoController(pdfDocumentFactory, tempFileManager);
    }

    // ---- reflection helpers -------------------------------------------------

    private Object invokePrivate(String name, Class<?>[] types, Object... args) throws Exception {
        Method method = ConvertPdfToVideoController.class.getDeclaredMethod(name, types);
        method.setAccessible(true);
        try {
            return method.invoke(controller, args);
        } catch (InvocationTargetException e) {
            Throwable cause = e.getCause();
            if (cause instanceof Exception ex) {
                throw ex;
            }
            throw e;
        }
    }

    private String normalizeFormat(String requested) throws Exception {
        return (String) invokePrivate("normalizeFormat", new Class<?>[] {String.class}, requested);
    }

    private MediaType getMediaType(String format) throws Exception {
        return (MediaType) invokePrivate("getMediaType", new Class<?>[] {String.class}, format);
    }

    private int getMaxDpi() throws Exception {
        return (int) invokePrivate("getMaxDpi", new Class<?>[] {});
    }

    @SuppressWarnings("unchecked")
    private List<String> buildFfmpegCommand(
            String format, String resolution, String frameRate, TempFile outputVideo)
            throws Exception {
        return (List<String>)
                invokePrivate(
                        "buildFfmpegCommand",
                        new Class<?>[] {String.class, String.class, String.class, TempFile.class},
                        format,
                        resolution,
                        frameRate,
                        outputVideo);
    }

    private void applyWatermark(BufferedImage image, float opacity, String text) throws Exception {
        invokePrivate(
                "applyWatermark",
                new Class<?>[] {BufferedImage.class, float.class, String.class},
                image,
                opacity,
                text);
    }

    private void generateFrames(
            Path inputPdf,
            Path outputDir,
            int dpi,
            float opacity,
            String watermarkText,
            boolean watermarkEnabled)
            throws Exception {
        invokePrivate(
                "generateFrames",
                new Class<?>[] {
                    Path.class, Path.class, int.class, float.class, String.class, boolean.class
                },
                inputPdf,
                outputDir,
                dpi,
                opacity,
                watermarkText,
                watermarkEnabled);
    }

    // ---- PDF builder helper -------------------------------------------------

    private byte[] buildPdf(int pageCount) throws IOException {
        try (PDDocument document = new PDDocument()) {
            for (int i = 0; i < pageCount; i++) {
                document.addPage(new PDPage(PDRectangle.A4));
            }
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            document.save(baos);
            return baos.toByteArray();
        }
    }

    // ---- normalizeFormat ----------------------------------------------------

    @Nested
    @DisplayName("normalizeFormat")
    class NormalizeFormat {

        @Test
        @DisplayName("null defaults to mp4")
        void nullDefaultsToMp4() throws Exception {
            assertEquals("mp4", normalizeFormat(null));
        }

        @Test
        @DisplayName("mp4 passes through")
        void mp4PassesThrough() throws Exception {
            assertEquals("mp4", normalizeFormat("mp4"));
        }

        @Test
        @DisplayName("webm passes through")
        void webmPassesThrough() throws Exception {
            assertEquals("webm", normalizeFormat("webm"));
        }

        @Test
        @DisplayName("uppercase is lowercased")
        void uppercaseIsLowercased() throws Exception {
            assertEquals("mp4", normalizeFormat("MP4"));
            assertEquals("webm", normalizeFormat("WEBM"));
        }

        @Test
        @DisplayName("mixed case is normalized")
        void mixedCaseIsNormalized() throws Exception {
            assertEquals("webm", normalizeFormat("WeBm"));
        }

        @Test
        @DisplayName("unsupported format falls back to mp4")
        void unsupportedFallsBackToMp4() throws Exception {
            assertEquals("mp4", normalizeFormat("avi"));
            assertEquals("mp4", normalizeFormat("gif"));
            assertEquals("mp4", normalizeFormat(""));
        }
    }

    // ---- getMediaType -------------------------------------------------------

    @Nested
    @DisplayName("getMediaType")
    class GetMediaType {

        @Test
        @DisplayName("webm maps to video/webm")
        void webmMapsToVideoWebm() throws Exception {
            assertEquals(MediaType.valueOf("video/webm"), getMediaType("webm"));
        }

        @Test
        @DisplayName("mp4 maps to video/mp4")
        void mp4MapsToVideoMp4() throws Exception {
            assertEquals(MediaType.valueOf("video/mp4"), getMediaType("mp4"));
        }

        @Test
        @DisplayName("unknown format defaults to video/mp4")
        void unknownDefaultsToVideoMp4() throws Exception {
            assertEquals(MediaType.valueOf("video/mp4"), getMediaType("avi"));
        }
    }

    // ---- getMaxDpi ----------------------------------------------------------

    @Nested
    @DisplayName("getMaxDpi")
    class GetMaxDpi {

        @Test
        @DisplayName("returns 500 fallback when no Spring context is available")
        void returnsFallbackWithoutContext() throws Exception {
            // No ApplicationContext is set in this unit test, so getBean returns null and the
            // method falls back to the hardcoded default of 500.
            assertEquals(500, getMaxDpi());
        }
    }

    // ---- buildFfmpegCommand -------------------------------------------------

    @Nested
    @DisplayName("buildFfmpegCommand")
    class BuildFfmpegCommand {

        private TempFile newTempFile(File backing) throws IOException {
            when(tempFileManager.createTempFile(any())).thenReturn(backing);
            return new TempFile(tempFileManager, ".mp4");
        }

        @Test
        @DisplayName("mp4 command includes libx264 and faststart flags")
        void mp4Command(@TempDir Path dir) throws Exception {
            File backing = dir.resolve("out.mp4").toFile();
            TempFile outputVideo = newTempFile(backing);

            List<String> command = buildFfmpegCommand("mp4", "ORIGINAL", "0.333333", outputVideo);

            assertEquals("ffmpeg", command.get(0));
            assertTrue(command.contains("-y"));
            assertTrue(command.contains("-framerate"));
            assertTrue(command.contains("0.333333"));
            assertTrue(command.contains("frame_%05d.png"));
            assertTrue(command.contains("-vf"));
            assertTrue(command.contains("libx264"));
            assertTrue(command.contains("yuv420p"));
            assertTrue(command.contains("+faststart"));
            assertFalse(command.contains("libvpx-vp9"));
            // Output path is always the last argument.
            assertEquals(backing.getAbsolutePath(), command.get(command.size() - 1));
        }

        @Test
        @DisplayName("webm command includes libvpx-vp9 and crf flags")
        void webmCommand(@TempDir Path dir) throws Exception {
            File backing = dir.resolve("out.webm").toFile();
            TempFile outputVideo = newTempFile(backing);

            List<String> command = buildFfmpegCommand("webm", "720P", "0.5", outputVideo);

            assertTrue(command.contains("libvpx-vp9"));
            assertTrue(command.contains("-crf"));
            assertTrue(command.contains("30"));
            assertFalse(command.contains("libx264"));
            assertFalse(command.contains("+faststart"));
            assertEquals(backing.getAbsolutePath(), command.get(command.size() - 1));
        }

        @Test
        @DisplayName("framerate value is placed right after -framerate")
        void framerateOrdering(@TempDir Path dir) throws Exception {
            TempFile outputVideo = newTempFile(dir.resolve("o.mp4").toFile());

            List<String> command = buildFfmpegCommand("mp4", "ORIGINAL", "0.25", outputVideo);

            int idx = command.indexOf("-framerate");
            assertTrue(idx >= 0);
            assertEquals("0.25", command.get(idx + 1));
        }

        @Test
        @DisplayName("known resolution applies the matching scale filter")
        void knownResolutionFilter(@TempDir Path dir) throws Exception {
            TempFile outputVideo = newTempFile(dir.resolve("o.mp4").toFile());

            List<String> command = buildFfmpegCommand("mp4", "1080P", "0.5", outputVideo);

            int idx = command.indexOf("-vf");
            assertEquals("scale=-2:1080,setsar=1", command.get(idx + 1));
        }

        @Test
        @DisplayName("unknown resolution falls back to the ORIGINAL filter")
        void unknownResolutionFallsBackToOriginal(@TempDir Path dir) throws Exception {
            TempFile outputVideo = newTempFile(dir.resolve("o.mp4").toFile());

            List<String> command = buildFfmpegCommand("mp4", "NONSENSE", "0.5", outputVideo);

            int idx = command.indexOf("-vf");
            assertEquals("scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1", command.get(idx + 1));
        }
    }

    // ---- applyWatermark -----------------------------------------------------

    @Nested
    @DisplayName("applyWatermark")
    class ApplyWatermark {

        private BufferedImage solidImage(int w, int h, Color color) {
            BufferedImage image = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = image.createGraphics();
            g.setColor(color);
            g.fillRect(0, 0, w, h);
            g.dispose();
            return image;
        }

        @Test
        @DisplayName("modifies pixels at full opacity without throwing")
        void modifiesPixels() throws Exception {
            // The watermark is drawn through the image centre, so a small image still gets pixels
            // painted; the smaller buffer keeps the two getRGB snapshots cheap.
            BufferedImage image = solidImage(100, 80, Color.RED);
            int[] before =
                    image.getRGB(
                            0, 0, image.getWidth(), image.getHeight(), null, 0, image.getWidth());

            applyWatermark(image, 1.0f, "CONFIDENTIAL");

            int[] after =
                    image.getRGB(
                            0, 0, image.getWidth(), image.getHeight(), null, 0, image.getWidth());
            boolean changed = false;
            for (int i = 0; i < before.length; i++) {
                if (before[i] != after[i]) {
                    changed = true;
                    break;
                }
            }
            assertTrue(changed, "watermark should have altered at least one pixel");
        }

        @Test
        @DisplayName("does not throw on a small square image")
        void handlesSmallImage() throws Exception {
            BufferedImage image = solidImage(50, 50, Color.BLUE);
            applyWatermark(image, 0.5f, "X");
            assertNotNull(image);
        }

        @Test
        @DisplayName("does not throw at zero opacity")
        void handlesZeroOpacity() throws Exception {
            BufferedImage image = solidImage(120, 80, Color.GREEN);
            applyWatermark(image, 0.0f, "WM");
            assertNotNull(image);
        }
    }

    // ---- generateFrames -----------------------------------------------------

    @Nested
    @DisplayName("generateFrames")
    class GenerateFrames {

        @Test
        @DisplayName("renders one PNG frame per page")
        void rendersOneFramePerPage(@TempDir Path dir) throws Exception {
            Path inputPdf = dir.resolve("input.pdf");
            Files.write(inputPdf, buildPdf(3));
            Path outputDir = Files.createDirectory(dir.resolve("frames"));

            // The factory must return a fresh, real document that the controller can render.
            when(pdfDocumentFactory.load(any(File.class))).thenReturn(Loader.loadPDF(buildPdf(3)));

            generateFrames(inputPdf, outputDir, 72, 1.0f, null, false);

            assertTrue(Files.exists(outputDir.resolve("frame_00001.png")));
            assertTrue(Files.exists(outputDir.resolve("frame_00002.png")));
            assertTrue(Files.exists(outputDir.resolve("frame_00003.png")));
            try (var stream = Files.list(outputDir)) {
                assertEquals(3, stream.count());
            }
        }

        @Test
        @DisplayName("applies watermark when enabled and still produces frames")
        void appliesWatermarkWhenEnabled(@TempDir Path dir) throws Exception {
            Path inputPdf = dir.resolve("input.pdf");
            Files.write(inputPdf, buildPdf(1));
            Path outputDir = Files.createDirectory(dir.resolve("frames"));

            when(pdfDocumentFactory.load(any(File.class))).thenReturn(Loader.loadPDF(buildPdf(1)));

            generateFrames(inputPdf, outputDir, 72, 0.8f, "DRAFT", true);

            Path frame = outputDir.resolve("frame_00001.png");
            assertTrue(Files.exists(frame));
            assertTrue(Files.size(frame) > 0);
        }

        @Test
        @DisplayName("zero-page document throws IllegalArgumentException")
        void zeroPageThrows(@TempDir Path dir) throws Exception {
            Path inputPdf = dir.resolve("empty.pdf");
            // An empty PDDocument (no pages) cannot be saved/loaded, so feed an empty doc directly.
            Files.write(inputPdf, new byte[] {0});
            Path outputDir = Files.createDirectory(dir.resolve("frames"));

            when(pdfDocumentFactory.load(any(File.class))).thenReturn(new PDDocument());

            assertThrows(
                    IllegalArgumentException.class,
                    () -> generateFrames(inputPdf, outputDir, 72, 1.0f, null, false));
            try (var stream = Files.list(outputDir)) {
                assertEquals(0, stream.count());
            }
        }

        @Test
        @DisplayName("propagates IOException from the document factory")
        void propagatesLoadFailure(@TempDir Path dir) throws Exception {
            Path inputPdf = dir.resolve("input.pdf");
            Files.write(inputPdf, buildPdf(1));
            Path outputDir = Files.createDirectory(dir.resolve("frames"));

            when(pdfDocumentFactory.load(any(File.class))).thenThrow(new IOException("boom"));

            assertThrows(
                    IOException.class,
                    () -> generateFrames(inputPdf, outputDir, 72, 1.0f, null, false));
        }
    }
}
