package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.awt.image.DataBufferInt;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.nio.file.Files;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.misc.ScannerEffectRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("ScannerEffectController Tests")
class ScannerEffectControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @InjectMocks private ScannerEffectController controller;

    @BeforeEach
    void setUp() throws Exception {
        // Real temp file backing so WebResponseUtils.pdfDocToWebResponse can save the output.
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("scanner_test", inv.<String>getArgument(0))
                                            .toFile();
                            f.deleteOnExit();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    private static MockMultipartFile pdfFile(String filename, int pageCount, PDRectangle pageSize)
            throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < pageCount; i++) {
                doc.addPage(new PDPage(pageSize));
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return new MockMultipartFile(
                    "fileInput", filename, "application/pdf", baos.toByteArray());
        }
    }

    private static ScannerEffectRequest baseRequest(MockMultipartFile file) {
        ScannerEffectRequest request = new ScannerEffectRequest();
        request.setFileInput(file);
        // Advanced enabled so quality presets do not override our resolution.
        request.setAdvancedEnabled(true);
        // Keep rendering tiny and fast; deterministic structure only.
        request.setResolution(36);
        request.setRotation(ScannerEffectRequest.Rotation.none);
        request.setRotate(0);
        request.setRotateVariance(0);
        request.setBorder(2);
        request.setBrightness(1.0f);
        request.setContrast(1.0f);
        request.setBlur(0f);
        request.setNoise(0f);
        request.setYellowish(false);
        request.setColorspace(ScannerEffectRequest.Colorspace.grayscale);
        return request;
    }

    /** Stub both factory.load overloads to return fresh real documents loaded from bytes. */
    private void stubFactoryLoad(byte[] pdfBytes) throws IOException {
        // Used for page count + as output base (load(byte[])).
        lenient()
                .when(pdfDocumentFactory.load(any(byte[].class)))
                .thenAnswer(
                        inv -> {
                            byte[] b = inv.getArgument(0);
                            return Loader.loadPDF(b);
                        });
        // Used by RenderingResources.fromBytes (load(byte[], true)).
        lenient()
                .when(pdfDocumentFactory.load(any(byte[].class), anyBoolean()))
                .thenAnswer(inv -> Loader.loadPDF((byte[]) inv.getArgument(0)));
    }

    private static byte[] drain(ResponseEntity<Resource> response) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (InputStream in = response.getBody().getInputStream()) {
            in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    // ---------------------------------------------------------------------
    // End-to-end controller behaviour (real rendering, mocked boundaries)
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("scannerEffect end-to-end")
    class EndToEnd {

        @Test
        @DisplayName("produces a valid single-page PDF response for a one-page input")
        void singlePageHappyPath() throws Exception {
            MockMultipartFile file = pdfFile("input.pdf", 1, PDRectangle.A6);
            stubFactoryLoad(file.getBytes());
            ScannerEffectRequest request = baseRequest(file);

            ResponseEntity<Resource> response = controller.scannerEffect(request);

            assertThat(response).isNotNull();
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isNotNull();

            byte[] out = drain(response);
            assertThat(out).isNotEmpty();
            try (PDDocument result = Loader.loadPDF(out)) {
                assertThat(result.getNumberOfPages()).isEqualTo(1);
                PDRectangle box = result.getPage(0).getMediaBox();
                // Output page keeps the original page dimensions.
                assertThat(box.getWidth()).isCloseTo(PDRectangle.A6.getWidth(), within(1f));
                assertThat(box.getHeight()).isCloseTo(PDRectangle.A6.getHeight(), within(1f));
            }
        }

        @Test
        @DisplayName("preserves page count for a multi-page input")
        void multiPageKeepsPageCount() throws Exception {
            MockMultipartFile file = pdfFile("multi.pdf", 3, PDRectangle.A6);
            stubFactoryLoad(file.getBytes());
            ScannerEffectRequest request = baseRequest(file);

            ResponseEntity<Resource> response = controller.scannerEffect(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            try (PDDocument result = Loader.loadPDF(drain(response))) {
                assertThat(result.getNumberOfPages()).isEqualTo(3);
            }
        }

        @Test
        @DisplayName("applies colour effects (color colorspace, blur, noise, yellowish, rotation)")
        void richEffectsStillProduceValidPdf() throws Exception {
            MockMultipartFile file = pdfFile("rich.pdf", 1, PDRectangle.A6);
            stubFactoryLoad(file.getBytes());
            ScannerEffectRequest request = baseRequest(file);
            request.setColorspace(ScannerEffectRequest.Colorspace.color);
            request.setBlur(1.0f);
            request.setNoise(4.0f);
            request.setYellowish(true);
            request.setRotation(ScannerEffectRequest.Rotation.slight);
            request.setRotateVariance(2);
            request.setBorder(5);
            request.setBrightness(1.05f);
            request.setContrast(1.1f);

            ResponseEntity<Resource> response = controller.scannerEffect(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            try (PDDocument result = Loader.loadPDF(drain(response))) {
                assertThat(result.getNumberOfPages()).isEqualTo(1);
            }
        }

        @Test
        @DisplayName("non-advanced request applies the quality preset without error")
        void qualityPresetPath() throws Exception {
            MockMultipartFile file = pdfFile("preset.pdf", 1, PDRectangle.A6);
            stubFactoryLoad(file.getBytes());
            ScannerEffectRequest request = baseRequest(file);
            request.setAdvancedEnabled(false);
            // Low preset uses resolution 75 which is the cheapest render.
            request.setQuality(ScannerEffectRequest.Quality.low);

            ResponseEntity<Resource> response = controller.scannerEffect(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            try (PDDocument result = Loader.loadPDF(drain(response))) {
                assertThat(result.getNumberOfPages()).isEqualTo(1);
            }
        }

        @Test
        @DisplayName("rejects a DPI above the safe maximum with IllegalArgumentException")
        void dpiAboveLimitIsRejected() throws Exception {
            MockMultipartFile file = pdfFile("highdpi.pdf", 1, PDRectangle.A6);
            stubFactoryLoad(file.getBytes());
            ScannerEffectRequest request = baseRequest(file);
            // No application context in tests -> maxSafeDpi defaults to 500.
            request.setResolution(600);

            assertThatThrownBy(() -> controller.scannerEffect(request))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("600");
        }

        @Test
        @DisplayName("rejects an empty (zero-page) document with IllegalArgumentException")
        void emptyDocumentIsRejected() throws Exception {
            // A real 1-page file on disk, but the factory returns an empty document.
            MockMultipartFile file = pdfFile("empty.pdf", 1, PDRectangle.A6);
            ScannerEffectRequest request = baseRequest(file);

            lenient()
                    .when(pdfDocumentFactory.load(any(byte[].class)))
                    .thenAnswer(inv -> new PDDocument());
            lenient()
                    .when(pdfDocumentFactory.load(any(byte[].class), anyBoolean()))
                    .thenAnswer(inv -> new PDDocument());

            assertThatThrownBy(() -> controller.scannerEffect(request))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("no pages");
        }

        @Test
        @DisplayName("propagates IOException from the document factory")
        void factoryIOExceptionPropagates() throws Exception {
            MockMultipartFile file = pdfFile("io.pdf", 1, PDRectangle.A6);
            ScannerEffectRequest request = baseRequest(file);

            lenient()
                    .when(pdfDocumentFactory.load(any(byte[].class)))
                    .thenThrow(new IOException("boom-load"));
            lenient()
                    .when(pdfDocumentFactory.load(any(byte[].class), anyBoolean()))
                    .thenThrow(new IOException("boom-load"));

            assertThatThrownBy(() -> controller.scannerEffect(request))
                    .isInstanceOf(IOException.class);
        }
    }

    // ---------------------------------------------------------------------
    // Pure static image-processing logic via reflection
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("calculateSafeResolution")
    class CalculateSafeResolution {

        private Method method;

        @BeforeEach
        void setUp() throws Exception {
            method =
                    ScannerEffectController.class.getDeclaredMethod(
                            "calculateSafeResolution", float.class, float.class, int.class);
            method.setAccessible(true);
        }

        private int invoke(float w, float h, int res) throws Exception {
            return (int) method.invoke(null, w, h, res);
        }

        @Test
        @DisplayName("keeps requested resolution when the projected image is small")
        void keepsResolutionForSmallPage() throws Exception {
            // A6 at 72 dpi is well within limits.
            assertThat(invoke(297f, 420f, 72)).isEqualTo(72);
        }

        @Test
        @DisplayName("downscales resolution when the projected image is huge")
        void downscalesForHugePage() throws Exception {
            // A0-ish page at a very high dpi exceeds the pixel/size caps.
            int safe = invoke(2384f, 3370f, 2000);
            assertThat(safe).isLessThan(2000);
            assertThat(safe).isGreaterThanOrEqualTo(72);
        }

        @Test
        @DisplayName("never returns below the floor of 72")
        void neverBelowFloor() throws Exception {
            int safe = invoke(5000f, 5000f, 4000);
            assertThat(safe).isGreaterThanOrEqualTo(72);
        }
    }

    @Nested
    @DisplayName("determineRenderResolution")
    class DetermineRenderResolution {

        @Test
        @DisplayName("returns the request resolution unchanged")
        void returnsRequestResolution() throws Exception {
            Method method =
                    ScannerEffectController.class.getDeclaredMethod(
                            "determineRenderResolution", ScannerEffectRequest.class);
            method.setAccessible(true);

            ScannerEffectRequest request = new ScannerEffectRequest();
            request.setResolution(123);

            assertThat((int) method.invoke(null, request)).isEqualTo(123);
        }
    }

    @Nested
    @DisplayName("convertColorspace / convertToGrayscale")
    class Colorspace {

        private static BufferedImage solid(int rgb) {
            BufferedImage image = new BufferedImage(4, 4, BufferedImage.TYPE_INT_RGB);
            for (int y = 0; y < 4; y++) {
                for (int x = 0; x < 4; x++) {
                    image.setRGB(x, y, rgb);
                }
            }
            return image;
        }

        @ParameterizedTest
        @EnumSource(ScannerEffectRequest.Colorspace.class)
        @DisplayName("returns an INT_RGB image of the same dimensions for any colorspace")
        void preservesDimensions(ScannerEffectRequest.Colorspace colorspace) throws Exception {
            Method method =
                    ScannerEffectController.class.getDeclaredMethod(
                            "convertColorspace",
                            BufferedImage.class,
                            ScannerEffectRequest.Colorspace.class);
            method.setAccessible(true);

            BufferedImage src = solid(0x123456);
            BufferedImage result = (BufferedImage) method.invoke(null, src, colorspace);

            assertThat(result.getWidth()).isEqualTo(4);
            assertThat(result.getHeight()).isEqualTo(4);
            assertThat(result.getType()).isEqualTo(BufferedImage.TYPE_INT_RGB);
        }

        @Test
        @DisplayName("grayscale collapses the channels to a single grey value")
        void grayscaleEqualisesChannels() throws Exception {
            Method method =
                    ScannerEffectController.class.getDeclaredMethod(
                            "convertColorspace",
                            BufferedImage.class,
                            ScannerEffectRequest.Colorspace.class);
            method.setAccessible(true);

            // R=90, G=120, B=150 -> avg 120 -> 0x787878
            BufferedImage src = solid((90 << 16) | (120 << 8) | 150);
            BufferedImage result =
                    (BufferedImage)
                            method.invoke(null, src, ScannerEffectRequest.Colorspace.grayscale);

            int px = result.getRGB(0, 0) & 0xFFFFFF;
            int r = (px >> 16) & 0xFF;
            int g = (px >> 8) & 0xFF;
            int b = px & 0xFF;
            assertThat(r).isEqualTo(g).isEqualTo(b);
            assertThat(r).isEqualTo(120);
        }

        @Test
        @DisplayName("convertToGrayscale mutates the buffer in place")
        void convertToGrayscaleInPlace() throws Exception {
            Method method =
                    ScannerEffectController.class.getDeclaredMethod(
                            "convertToGrayscale", BufferedImage.class);
            method.setAccessible(true);

            BufferedImage img = solid((30 << 16) | (60 << 8) | 90); // avg 60
            method.invoke(null, img);

            int px = img.getRGB(1, 1) & 0xFFFFFF;
            assertThat(px).isEqualTo((60 << 16) | (60 << 8) | 60);
        }
    }

    @Nested
    @DisplayName("calculateRotation")
    class CalculateRotation {

        private Method method;

        @BeforeEach
        void setUp() throws Exception {
            method =
                    ScannerEffectController.class.getDeclaredMethod(
                            "calculateRotation", int.class, int.class);
            method.setAccessible(true);
        }

        @Test
        @DisplayName("returns exactly 0 when base rotation and variance are both 0")
        void zeroWhenNoRotation() throws Exception {
            assertThat((double) method.invoke(null, 0, 0)).isEqualTo(0.0);
        }

        @Test
        @DisplayName("stays within base +/- variance bounds")
        void withinBounds() throws Exception {
            for (int i = 0; i < 100; i++) {
                double value = (double) method.invoke(null, 5, 3);
                assertThat(value).isBetween(2.0, 8.0);
            }
        }

        @Test
        @DisplayName("with zero variance but non-zero base returns the base rotation")
        void zeroVarianceReturnsBase() throws Exception {
            // base=5, variance=0 -> 5 + (rand*2-1)*0 = 5
            assertThat((double) method.invoke(null, 5, 0)).isEqualTo(5.0);
        }
    }

    @Nested
    @DisplayName("blendColors")
    class BlendColors {

        private Method method;

        @BeforeEach
        void setUp() throws Exception {
            method =
                    ScannerEffectController.class.getDeclaredMethod(
                            "blendColors", int.class, int.class, float.class);
            method.setAccessible(true);
        }

        private int invoke(int fg, int bg, float alpha) throws Exception {
            return (int) method.invoke(null, fg, bg, alpha);
        }

        @Test
        @DisplayName("alpha=1 yields the foreground colour")
        void alphaOneIsForeground() throws Exception {
            assertThat(invoke(0xAABBCC, 0x112233, 1.0f)).isEqualTo(0xAABBCC);
        }

        @Test
        @DisplayName("alpha=0 yields the background colour")
        void alphaZeroIsBackground() throws Exception {
            assertThat(invoke(0xAABBCC, 0x112233, 0.0f)).isEqualTo(0x112233);
        }

        @Test
        @DisplayName("alpha=0.5 yields the rounded midpoint per channel")
        void alphaHalfIsMidpoint() throws Exception {
            // fg 0x806040 (128,96,64), bg 0x204060 (32,64,96)
            int blended = invoke(0x806040, 0x204060, 0.5f);
            int r = (blended >> 16) & 0xFF;
            int g = (blended >> 8) & 0xFF;
            int b = blended & 0xFF;
            assertThat(r).isEqualTo(80); // (128+32)/2
            assertThat(g).isEqualTo(80); // (96+64)/2
            assertThat(b).isEqualTo(80); // (64+96)/2
        }
    }

    @Nested
    @DisplayName("fillWithGradient")
    class FillWithGradient {

        private Method method;

        @BeforeEach
        void setUp() throws Exception {
            method =
                    ScannerEffectController.class.getDeclaredMethod(
                            "fillWithGradient",
                            int[].class,
                            int.class,
                            int.class,
                            int[].class,
                            boolean.class);
            method.setAccessible(true);
        }

        @Test
        @DisplayName("vertical gradient assigns one LUT value per row")
        void verticalFill() throws Exception {
            int width = 3;
            int height = 2;
            int[] pixels = new int[width * height];
            int[] lut = {0x111111, 0x222222};

            method.invoke(null, pixels, width, height, lut, true);

            // Row 0 all lut[0], row 1 all lut[1].
            assertThat(pixels[0]).isEqualTo(0x111111);
            assertThat(pixels[2]).isEqualTo(0x111111);
            assertThat(pixels[3]).isEqualTo(0x222222);
            assertThat(pixels[5]).isEqualTo(0x222222);
        }

        @Test
        @DisplayName("horizontal gradient assigns one LUT value per column, repeated each row")
        void horizontalFill() throws Exception {
            int width = 3;
            int height = 2;
            int[] pixels = new int[width * height];
            int[] lut = {0xAA0000, 0x00BB00, 0x0000CC};

            method.invoke(null, pixels, width, height, lut, false);

            // Each row mirrors the LUT.
            assertThat(pixels[0]).isEqualTo(0xAA0000);
            assertThat(pixels[1]).isEqualTo(0x00BB00);
            assertThat(pixels[2]).isEqualTo(0x0000CC);
            assertThat(pixels[3]).isEqualTo(0xAA0000);
            assertThat(pixels[4]).isEqualTo(0x00BB00);
            assertThat(pixels[5]).isEqualTo(0x0000CC);
        }
    }

    @Nested
    @DisplayName("createGradientLUT")
    class CreateGradientLUT {

        private Object gradient(boolean vertical, Color start, Color end) throws Exception {
            Class<?> gradientClass =
                    Class.forName(
                            "stirling.software.SPDF.controller.api.misc.ScannerEffectController$GradientConfig");
            Constructor<?> ctor =
                    gradientClass.getDeclaredConstructor(boolean.class, Color.class, Color.class);
            ctor.setAccessible(true);
            return ctor.newInstance(vertical, start, end);
        }

        private int[] invokeLut(int width, int height, Object gradientConfig) throws Exception {
            Class<?> gradientClass =
                    Class.forName(
                            "stirling.software.SPDF.controller.api.misc.ScannerEffectController$GradientConfig");
            Method method =
                    ScannerEffectController.class.getDeclaredMethod(
                            "createGradientLUT", int.class, int.class, gradientClass);
            method.setAccessible(true);
            return (int[]) method.invoke(null, width, height, gradientConfig);
        }

        @Test
        @DisplayName("vertical LUT length equals height and interpolates endpoints")
        void verticalLut() throws Exception {
            Object g = gradient(true, Color.BLACK, Color.WHITE);
            int[] lut = invokeLut(10, 5, g);

            assertThat(lut).hasSize(5);
            assertThat(lut[0] & 0xFFFFFF).isEqualTo(0x000000);
            assertThat(lut[lut.length - 1] & 0xFFFFFF).isEqualTo(0xFFFFFF);
        }

        @Test
        @DisplayName("horizontal LUT length equals width")
        void horizontalLut() throws Exception {
            Object g = gradient(false, Color.BLACK, Color.WHITE);
            int[] lut = invokeLut(7, 3, g);

            assertThat(lut).hasSize(7);
            assertThat(lut[0] & 0xFFFFFF).isEqualTo(0x000000);
            assertThat(lut[lut.length - 1] & 0xFFFFFF).isEqualTo(0xFFFFFF);
        }

        @Test
        @DisplayName("constant colour produces a uniform LUT")
        void uniformLut() throws Exception {
            Object g = gradient(true, new Color(0x40, 0x50, 0x60), new Color(0x40, 0x50, 0x60));
            int[] lut = invokeLut(4, 4, g);

            for (int value : lut) {
                assertThat(value & 0xFFFFFF).isEqualTo(0x405060);
            }
        }
    }

    @Nested
    @DisplayName("applyAllEffectsSinglePass")
    class ApplyAllEffects {

        private Method method;

        @BeforeEach
        void setUp() throws Exception {
            method =
                    ScannerEffectController.class.getDeclaredMethod(
                            "applyAllEffectsSinglePass",
                            BufferedImage.class,
                            float.class,
                            float.class,
                            boolean.class,
                            double.class);
            method.setAccessible(true);
        }

        private static BufferedImage solid(int width, int height, int rgb) {
            BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
            int[] pixels = ((DataBufferInt) image.getRaster().getDataBuffer()).getData();
            java.util.Arrays.fill(pixels, rgb);
            return image;
        }

        @Test
        @DisplayName("identity settings leave pixels unchanged")
        void identityKeepsPixels() throws Exception {
            BufferedImage src = solid(8, 8, 0x648CB4); // 100,140,180
            BufferedImage out = (BufferedImage) method.invoke(null, src, 1.0f, 1.0f, false, 0.0d);

            assertThat(out.getWidth()).isEqualTo(8);
            assertThat(out.getHeight()).isEqualTo(8);
            assertThat(out.getRGB(0, 0) & 0xFFFFFF).isEqualTo(0x648CB4);
        }

        @Test
        @DisplayName("brightness > 1 increases channel values and clamps at 255")
        void brightnessClamps() throws Exception {
            BufferedImage src = solid(4, 4, 0xC8C8C8); // 200 each
            BufferedImage out = (BufferedImage) method.invoke(null, src, 2.0f, 1.0f, false, 0.0d);

            int px = out.getRGB(0, 0) & 0xFFFFFF;
            // 200 * 2 = 400 -> clamped to 255 on every channel.
            assertThat(px).isEqualTo(0xFFFFFF);
        }

        @Test
        @DisplayName("zero brightness produces black")
        void zeroBrightnessIsBlack() throws Exception {
            BufferedImage src = solid(4, 4, 0xFFFFFF);
            BufferedImage out = (BufferedImage) method.invoke(null, src, 0.0f, 1.0f, false, 0.0d);

            assertThat(out.getRGB(0, 0) & 0xFFFFFF).isEqualTo(0x000000);
        }

        @Test
        @DisplayName("yellowish tint lowers the blue channel relative to source")
        void yellowishReducesBlue() throws Exception {
            BufferedImage src = solid(4, 4, 0xFFFFFF); // bright white maximises tint effect
            BufferedImage out = (BufferedImage) method.invoke(null, src, 1.0f, 1.0f, true, 0.0d);

            int px = out.getRGB(0, 0) & 0xFFFFFF;
            int b = px & 0xFF;
            assertThat(b).isLessThan(255);
        }

        @Test
        @DisplayName("noise keeps every channel within the valid 0..255 range")
        void noiseStaysInRange() throws Exception {
            BufferedImage src = solid(32, 32, 0x808080);
            BufferedImage out = (BufferedImage) method.invoke(null, src, 1.0f, 1.0f, false, 50.0d);

            for (int y = 0; y < out.getHeight(); y++) {
                for (int x = 0; x < out.getWidth(); x++) {
                    int px = out.getRGB(x, y);
                    assertThat((px >> 16) & 0xFF).isBetween(0, 255);
                    assertThat((px >> 8) & 0xFF).isBetween(0, 255);
                    assertThat(px & 0xFF).isBetween(0, 255);
                }
            }
        }
    }

    @Nested
    @DisplayName("softenEdges")
    class SoftenEdges {

        private Method method;

        @BeforeEach
        void setUp() throws Exception {
            method =
                    ScannerEffectController.class.getDeclaredMethod(
                            "softenEdges",
                            BufferedImage.class,
                            int.class,
                            Color.class,
                            Color.class,
                            boolean.class);
            method.setAccessible(true);
        }

        @Test
        @DisplayName("center pixel stays at foreground when feathering only touches edges")
        void centreStaysForeground() throws Exception {
            BufferedImage src = new BufferedImage(11, 11, BufferedImage.TYPE_INT_RGB);
            int fg = 0x102030;
            int[] pixels = ((DataBufferInt) src.getRaster().getDataBuffer()).getData();
            java.util.Arrays.fill(pixels, fg);

            BufferedImage out =
                    (BufferedImage) method.invoke(null, src, 2, Color.WHITE, Color.WHITE, true);

            // Centre is far from any edge (distance 5 >= feather radius 2) so alpha=1.
            assertThat(out.getRGB(5, 5) & 0xFFFFFF).isEqualTo(fg);
        }

        @Test
        @DisplayName("corner pixel is blended toward the background gradient")
        void cornerBlendsToBackground() throws Exception {
            BufferedImage src = new BufferedImage(11, 11, BufferedImage.TYPE_INT_RGB);
            int fg = 0x000000;
            int[] pixels = ((DataBufferInt) src.getRaster().getDataBuffer()).getData();
            java.util.Arrays.fill(pixels, fg);

            // Background is pure white; corner distance d=0 -> alpha=0 -> background.
            BufferedImage out =
                    (BufferedImage) method.invoke(null, src, 3, Color.WHITE, Color.WHITE, true);

            assertThat(out.getRGB(0, 0) & 0xFFFFFF).isEqualTo(0xFFFFFF);
        }

        @Test
        @DisplayName("preserves image dimensions")
        void preservesDimensions() throws Exception {
            BufferedImage src = new BufferedImage(6, 9, BufferedImage.TYPE_INT_RGB);
            BufferedImage out =
                    (BufferedImage) method.invoke(null, src, 1, Color.GRAY, Color.DARK_GRAY, false);

            assertThat(out.getWidth()).isEqualTo(6);
            assertThat(out.getHeight()).isEqualTo(9);
        }
    }

    @Nested
    @DisplayName("applyGaussianBlur")
    class ApplyGaussianBlur {

        private Method method;

        @BeforeEach
        void setUp() throws Exception {
            method =
                    ScannerEffectController.class.getDeclaredMethod(
                            "applyGaussianBlur", BufferedImage.class, double.class);
            method.setAccessible(true);
        }

        @Test
        @DisplayName("sigma <= 0 returns the same image instance")
        void zeroSigmaIsNoOp() throws Exception {
            BufferedImage src = new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB);
            BufferedImage out = (BufferedImage) method.invoke(null, src, 0.0d);
            assertThat(out).isSameAs(src);
        }

        @Test
        @DisplayName("negative sigma returns the same image instance")
        void negativeSigmaIsNoOp() throws Exception {
            BufferedImage src = new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB);
            BufferedImage out = (BufferedImage) method.invoke(null, src, -1.0d);
            assertThat(out).isSameAs(src);
        }

        @Test
        @DisplayName("positive sigma on a uniform image keeps the uniform colour and dimensions")
        void uniformImageStaysUniform() throws Exception {
            BufferedImage src = new BufferedImage(40, 40, BufferedImage.TYPE_INT_RGB);
            int color = 0x405060;
            int[] pixels = ((DataBufferInt) src.getRaster().getDataBuffer()).getData();
            java.util.Arrays.fill(pixels, color);

            BufferedImage out = (BufferedImage) method.invoke(null, src, 30.0d);

            assertThat(out).isNotSameAs(src);
            assertThat(out.getWidth()).isEqualTo(40);
            assertThat(out.getHeight()).isEqualTo(40);
            // Blurring a uniform image yields the same uniform colour.
            assertThat(out.getRGB(20, 20) & 0xFFFFFF).isEqualTo(color);
        }
    }

    @Nested
    @DisplayName("rotateImage")
    class RotateImage {

        private Object gradient() throws Exception {
            Class<?> gradientClass =
                    Class.forName(
                            "stirling.software.SPDF.controller.api.misc.ScannerEffectController$GradientConfig");
            Constructor<?> ctor =
                    gradientClass.getDeclaredConstructor(boolean.class, Color.class, Color.class);
            ctor.setAccessible(true);
            return ctor.newInstance(true, Color.WHITE, Color.WHITE);
        }

        private Method rotateMethod() throws Exception {
            Class<?> gradientClass =
                    Class.forName(
                            "stirling.software.SPDF.controller.api.misc.ScannerEffectController$GradientConfig");
            Method method =
                    ScannerEffectController.class.getDeclaredMethod(
                            "rotateImage", BufferedImage.class, double.class, gradientClass);
            method.setAccessible(true);
            return method;
        }

        @Test
        @DisplayName("zero rotation returns the same image instance")
        void zeroRotationNoOp() throws Exception {
            BufferedImage src = new BufferedImage(10, 10, BufferedImage.TYPE_INT_RGB);
            BufferedImage out = (BufferedImage) rotateMethod().invoke(null, src, 0.0d, gradient());
            assertThat(out).isSameAs(src);
        }

        @Test
        @DisplayName("90 degree rotation swaps the bounding box dimensions")
        void ninetyDegreeSwapsDimensions() throws Exception {
            BufferedImage src = new BufferedImage(20, 10, BufferedImage.TYPE_INT_RGB);
            BufferedImage out = (BufferedImage) rotateMethod().invoke(null, src, 90.0d, gradient());

            assertThat(out).isNotSameAs(src);
            // For 90 degrees, rotated bounds become height x width.
            assertThat(out.getWidth()).isEqualTo(10);
            assertThat(out.getHeight()).isEqualTo(20);
        }

        @Test
        @DisplayName("45 degree rotation grows the bounding box")
        void fortyFiveGrowsBoundingBox() throws Exception {
            BufferedImage src = new BufferedImage(20, 20, BufferedImage.TYPE_INT_RGB);
            BufferedImage out = (BufferedImage) rotateMethod().invoke(null, src, 45.0d, gradient());

            assertThat(out.getWidth()).isGreaterThan(20);
            assertThat(out.getHeight()).isGreaterThan(20);
        }
    }

    @Nested
    @DisplayName("addBorderWithGradient")
    class AddBorderWithGradient {

        private Object gradient(boolean vertical) throws Exception {
            Class<?> gradientClass =
                    Class.forName(
                            "stirling.software.SPDF.controller.api.misc.ScannerEffectController$GradientConfig");
            Constructor<?> ctor =
                    gradientClass.getDeclaredConstructor(boolean.class, Color.class, Color.class);
            ctor.setAccessible(true);
            return ctor.newInstance(vertical, Color.GRAY, Color.LIGHT_GRAY);
        }

        private Method borderMethod() throws Exception {
            Class<?> gradientClass =
                    Class.forName(
                            "stirling.software.SPDF.controller.api.misc.ScannerEffectController$GradientConfig");
            Method method =
                    ScannerEffectController.class.getDeclaredMethod(
                            "addBorderWithGradient", BufferedImage.class, int.class, gradientClass);
            method.setAccessible(true);
            return method;
        }

        @Test
        @DisplayName("adds a border of the requested size on every side")
        void growsByTwiceBorder() throws Exception {
            BufferedImage src = new BufferedImage(10, 12, BufferedImage.TYPE_INT_RGB);
            int border = 5;
            BufferedImage out =
                    (BufferedImage) borderMethod().invoke(null, src, border, gradient(true));

            assertThat(out.getWidth()).isEqualTo(10 + 2 * border);
            assertThat(out.getHeight()).isEqualTo(12 + 2 * border);
        }

        @Test
        @DisplayName("zero border keeps the original dimensions")
        void zeroBorderKeepsDimensions() throws Exception {
            BufferedImage src = new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB);
            BufferedImage out =
                    (BufferedImage) borderMethod().invoke(null, src, 0, gradient(false));

            assertThat(out.getWidth()).isEqualTo(8);
            assertThat(out.getHeight()).isEqualTo(8);
        }

        @Test
        @DisplayName("preserves the drawn source region inside the border")
        void preservesSourcePixels() throws Exception {
            BufferedImage src = new BufferedImage(6, 6, BufferedImage.TYPE_INT_RGB);
            int fg = 0x123456;
            int[] pixels = ((DataBufferInt) src.getRaster().getDataBuffer()).getData();
            java.util.Arrays.fill(pixels, fg);

            int border = 3;
            BufferedImage out =
                    (BufferedImage) borderMethod().invoke(null, src, border, gradient(true));

            // Source top-left maps to (border, border) in the composed image.
            assertThat(out.getRGB(border, border) & 0xFFFFFF).isEqualTo(fg);
        }
    }

    // ---------------------------------------------------------------------
    // Small AssertJ helper for float closeness
    // ---------------------------------------------------------------------

    private static org.assertj.core.data.Offset<Float> within(float tol) {
        return org.assertj.core.data.Offset.offset(tol);
    }
}
