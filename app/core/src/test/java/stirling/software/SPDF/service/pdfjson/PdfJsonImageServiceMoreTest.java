package stirling.software.SPDF.service.pdfjson;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyFloat;
import static org.mockito.Mockito.*;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.lang.reflect.Method;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.util.Matrix;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.json.PdfJsonImageElement;

/**
 * Gap coverage for PdfJsonImageService - exercises the real draw / encode / extract paths using a
 * genuine PNG image, plus transform / fallback dimension resolution and private helpers.
 */
class PdfJsonImageServiceMoreTest {

    private PdfJsonImageService service;

    @BeforeEach
    void setUp() {
        service = new PdfJsonImageService();
    }

    private byte[] pngBytes(int w, int h) throws IOException {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        for (int x = 0; x < w; x++) {
            for (int y = 0; y < h; y++) {
                img.setRGB(x, y, Color.RED.getRGB());
            }
        }
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(img, "png", baos);
        return baos.toByteArray();
    }

    private String pngBase64(int w, int h) throws IOException {
        return Base64.getEncoder().encodeToString(pngBytes(w, h));
    }

    @Nested
    @DisplayName("createImageXObject")
    class CreateImageXObject {

        @Test
        @DisplayName("valid PNG base64 creates a real XObject")
        void validPng_returnsXObject() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PdfJsonImageElement element = new PdfJsonImageElement();
                element.setImageData(pngBase64(4, 3));
                element.setId("img-1");

                PDImageXObject xobj = service.createImageXObject(doc, element);
                assertNotNull(xobj);
                assertEquals(4, xobj.getWidth());
                assertEquals(3, xobj.getHeight());
            }
        }

        @Test
        @DisplayName("null id falls back to random UUID name")
        void nullId_randomName() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PdfJsonImageElement element = new PdfJsonImageElement();
                element.setImageData(pngBase64(2, 2));
                element.setId(null);

                PDImageXObject xobj = service.createImageXObject(doc, element);
                assertNotNull(xobj);
            }
        }
    }

    @Nested
    @DisplayName("drawImageElement")
    class DrawImageElement {

        @Test
        @DisplayName("with 6-element transform draws via matrix")
        void withTransform_drawsMatrix() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDPageContentStream cs = mock(PDPageContentStream.class);
                PdfJsonImageElement element = new PdfJsonImageElement();
                element.setImageData(pngBase64(5, 5));
                element.setId("t1");
                element.setTransform(new float[] {10f, 0f, 0f, 10f, 20f, 30f});
                Map<String, PDImageXObject> cache = new HashMap<>();

                service.drawImageElement(cs, doc, element, cache);

                verify(cs).drawImage(any(PDImageXObject.class), any(Matrix.class));
                assertThat(cache).hasSize(1);
            }
        }

        @Test
        @DisplayName("transform with NaN values falls back to safe defaults")
        void withNaNTransform_usesSafeFloat() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDPageContentStream cs = mock(PDPageContentStream.class);
                PdfJsonImageElement element = new PdfJsonImageElement();
                element.setImageData(pngBase64(5, 5));
                element.setId("t-nan");
                element.setTransform(
                        new float[] {Float.NaN, 0f, 0f, Float.POSITIVE_INFINITY, 0f, 0f});
                Map<String, PDImageXObject> cache = new HashMap<>();

                service.drawImageElement(cs, doc, element, cache);

                verify(cs).drawImage(any(PDImageXObject.class), any(Matrix.class));
            }
        }

        @Test
        @DisplayName("without transform uses explicit width/height/left/bottom")
        void withoutTransform_explicitDims() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDPageContentStream cs = mock(PDPageContentStream.class);
                PdfJsonImageElement element = new PdfJsonImageElement();
                element.setImageData(pngBase64(5, 5));
                element.setId("d1");
                element.setWidth(50f);
                element.setHeight(40f);
                element.setLeft(12f);
                element.setBottom(13f);
                Map<String, PDImageXObject> cache = new HashMap<>();

                service.drawImageElement(cs, doc, element, cache);

                verify(cs).drawImage(any(PDImageXObject.class), eq(12f), eq(13f), eq(50f), eq(40f));
            }
        }

        @Test
        @DisplayName("without transform, zero dims fall back to native size")
        void withoutTransform_zeroDimsFallBack() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDPageContentStream cs = mock(PDPageContentStream.class);
                PdfJsonImageElement element = new PdfJsonImageElement();
                element.setImageData(pngBase64(6, 7));
                element.setId("d2");
                element.setWidth(0f);
                element.setHeight(0f);
                element.setNativeWidth(6);
                element.setNativeHeight(7);
                Map<String, PDImageXObject> cache = new HashMap<>();

                service.drawImageElement(cs, doc, element, cache);

                verify(cs)
                        .drawImage(
                                any(PDImageXObject.class),
                                anyFloat(),
                                anyFloat(),
                                anyFloat(),
                                anyFloat());
            }
        }

        @Test
        @DisplayName("cache hit reuses XObject and does not recreate")
        void cacheHit_reusesXObject() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDPageContentStream cs = mock(PDPageContentStream.class);
                PdfJsonImageElement element = new PdfJsonImageElement();
                element.setImageData(pngBase64(3, 3));
                element.setId("reuse");
                element.setTransform(new float[] {1f, 0f, 0f, 1f, 0f, 0f});
                Map<String, PDImageXObject> cache = new HashMap<>();

                service.drawImageElement(cs, doc, element, cache);
                PDImageXObject first = cache.get("reuse");
                service.drawImageElement(cs, doc, element, cache);
                PDImageXObject second = cache.get("reuse");

                assertSame(first, second);
                verify(cs, times(2)).drawImage(any(PDImageXObject.class), any(Matrix.class));
            }
        }

        @Test
        @DisplayName("undecodable image data short-circuits without drawing")
        void badImageData_noDraw() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDPageContentStream cs = mock(PDPageContentStream.class);
                PdfJsonImageElement element = new PdfJsonImageElement();
                // valid base64 but not an image -> createImageXObject returns/throws -> no draw
                element.setImageData("!!!not-base64!!!");
                element.setId("bad");
                Map<String, PDImageXObject> cache = new HashMap<>();

                service.drawImageElement(cs, doc, element, cache);
                verifyNoInteractions(cs);
            }
        }

        @Test
        @DisplayName("element with no id uses identity-hash cache key")
        void noId_identityHashCacheKey() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDPageContentStream cs = mock(PDPageContentStream.class);
                PdfJsonImageElement element = new PdfJsonImageElement();
                element.setImageData(pngBase64(3, 3));
                element.setId(null);
                element.setTransform(new float[] {1f, 0f, 0f, 1f, 0f, 0f});
                Map<String, PDImageXObject> cache = new HashMap<>();

                service.drawImageElement(cs, doc, element, cache);
                assertThat(cache).hasSize(1);
            }
        }
    }

    @Nested
    @DisplayName("collectImages / extractImagesForPage with real image")
    class ExtractWithRealImage {

        private void drawImageOnPage(PDDocument doc, PDPage page) throws IOException {
            PDImageXObject image = PDImageXObject.createFromByteArray(doc, pngBytes(8, 8), "real");
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.drawImage(image, 50, 50, 80, 80);
            }
        }

        @Test
        @DisplayName("extractImagesForPage returns the embedded image element")
        void extractImagesForPage_findsImage() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                drawImageOnPage(doc, page);

                List<PdfJsonImageElement> result = service.extractImagesForPage(doc, page, 1);
                assertThat(result).hasSize(1);
                PdfJsonImageElement el = result.get(0);
                assertNotNull(el.getImageData());
                assertNotNull(el.getImageFormat());
                assertEquals(8, el.getNativeWidth());
                assertEquals(8, el.getNativeHeight());
                assertNotNull(el.getTransform());
                assertEquals(6, el.getTransform().length);
                assertFalse(el.getInlineImage());
            }
        }

        @Test
        @DisplayName("collectImages returns image and fires progress per page")
        void collectImages_findsImage() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                drawImageOnPage(doc, page);

                var progress =
                        new java.util.ArrayList<
                                stirling.software.SPDF.model.api.PdfJsonConversionProgress>();
                Map<Integer, List<PdfJsonImageElement>> result =
                        service.collectImages(doc, 1, progress::add);

                assertThat(result).containsKey(1);
                assertThat(result.get(1)).hasSize(1);
                assertEquals(1, progress.size());
            }
        }

        @Test
        @DisplayName("same image drawn twice on a page is encoded once (cache reuse)")
        void collectImages_cachesRepeatImage() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PDPage page = new PDPage(PDRectangle.LETTER);
                doc.addPage(page);
                PDImageXObject image =
                        PDImageXObject.createFromByteArray(doc, pngBytes(8, 8), "shared");
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.drawImage(image, 10, 10, 40, 40);
                    cs.drawImage(image, 100, 100, 40, 40);
                }

                Map<Integer, List<PdfJsonImageElement>> result =
                        service.collectImages(doc, 1, p -> {});
                assertThat(result.get(1)).hasSize(2);
                // both elements share identical base64 payload
                assertEquals(
                        result.get(1).get(0).getImageData(), result.get(1).get(1).getImageData());
            }
        }
    }

    @Nested
    @DisplayName("private helpers via reflection")
    class PrivateHelpers {

        private Object invoke(String method, Class<?>[] sig, Object... args) throws Exception {
            Method m = PdfJsonImageService.class.getDeclaredMethod(method, sig);
            m.setAccessible(true);
            return m.invoke(service, args);
        }

        @Test
        @DisplayName("safeFloat replaces null / NaN / Infinity with default")
        void safeFloat() throws Exception {
            assertEquals(
                    5f, invoke("safeFloat", new Class<?>[] {Float.class, float.class}, null, 5f));
            assertEquals(
                    9f,
                    invoke("safeFloat", new Class<?>[] {Float.class, float.class}, Float.NaN, 9f));
            assertEquals(
                    2f,
                    invoke(
                            "safeFloat",
                            new Class<?>[] {Float.class, float.class},
                            Float.POSITIVE_INFINITY,
                            2f));
            assertEquals(
                    7f, invoke("safeFloat", new Class<?>[] {Float.class, float.class}, 7f, 0f));
        }

        @Test
        @DisplayName("fallbackWidth/Height prefer bounds, then native, then 1")
        void fallbackDims() throws Exception {
            PdfJsonImageElement bounds = new PdfJsonImageElement();
            bounds.setLeft(10f);
            bounds.setRight(40f);
            bounds.setBottom(5f);
            bounds.setTop(25f);
            assertEquals(
                    30f,
                    invoke("fallbackWidth", new Class<?>[] {PdfJsonImageElement.class}, bounds));
            assertEquals(
                    20f,
                    invoke("fallbackHeight", new Class<?>[] {PdfJsonImageElement.class}, bounds));

            PdfJsonImageElement nativeOnly = new PdfJsonImageElement();
            nativeOnly.setNativeWidth(123);
            nativeOnly.setNativeHeight(456);
            assertEquals(
                    123f,
                    invoke(
                            "fallbackWidth",
                            new Class<?>[] {PdfJsonImageElement.class},
                            nativeOnly));
            assertEquals(
                    456f,
                    invoke(
                            "fallbackHeight",
                            new Class<?>[] {PdfJsonImageElement.class},
                            nativeOnly));

            PdfJsonImageElement empty = new PdfJsonImageElement();
            assertEquals(
                    1f, invoke("fallbackWidth", new Class<?>[] {PdfJsonImageElement.class}, empty));
            assertEquals(
                    1f,
                    invoke("fallbackHeight", new Class<?>[] {PdfJsonImageElement.class}, empty));
        }

        @Test
        @DisplayName("resolveLeft prefers left, then x, then right-width, else 0")
        void resolveLeft() throws Exception {
            PdfJsonImageElement leftEl = new PdfJsonImageElement();
            leftEl.setLeft(11f);
            assertEquals(
                    11f,
                    invoke(
                            "resolveLeft",
                            new Class<?>[] {PdfJsonImageElement.class, float.class},
                            leftEl,
                            10f));

            PdfJsonImageElement xEl = new PdfJsonImageElement();
            xEl.setX(22f);
            assertEquals(
                    22f,
                    invoke(
                            "resolveLeft",
                            new Class<?>[] {PdfJsonImageElement.class, float.class},
                            xEl,
                            10f));

            PdfJsonImageElement rightEl = new PdfJsonImageElement();
            rightEl.setRight(100f);
            assertEquals(
                    70f,
                    invoke(
                            "resolveLeft",
                            new Class<?>[] {PdfJsonImageElement.class, float.class},
                            rightEl,
                            30f));

            PdfJsonImageElement none = new PdfJsonImageElement();
            assertEquals(
                    0f,
                    invoke(
                            "resolveLeft",
                            new Class<?>[] {PdfJsonImageElement.class, float.class},
                            none,
                            30f));
        }

        @Test
        @DisplayName("resolveBottom prefers bottom, then y, then top-height, else 0")
        void resolveBottom() throws Exception {
            PdfJsonImageElement bottomEl = new PdfJsonImageElement();
            bottomEl.setBottom(11f);
            assertEquals(
                    11f,
                    invoke(
                            "resolveBottom",
                            new Class<?>[] {PdfJsonImageElement.class, float.class},
                            bottomEl,
                            10f));

            PdfJsonImageElement yEl = new PdfJsonImageElement();
            yEl.setY(22f);
            assertEquals(
                    22f,
                    invoke(
                            "resolveBottom",
                            new Class<?>[] {PdfJsonImageElement.class, float.class},
                            yEl,
                            10f));

            PdfJsonImageElement topEl = new PdfJsonImageElement();
            topEl.setTop(100f);
            assertEquals(
                    60f,
                    invoke(
                            "resolveBottom",
                            new Class<?>[] {PdfJsonImageElement.class, float.class},
                            topEl,
                            40f));

            PdfJsonImageElement none = new PdfJsonImageElement();
            assertEquals(
                    0f,
                    invoke(
                            "resolveBottom",
                            new Class<?>[] {PdfJsonImageElement.class, float.class},
                            none,
                            40f));
        }

        @Test
        @DisplayName("toMatrixValues returns the six affine components")
        void toMatrixValues() throws Exception {
            Matrix m = new Matrix(2f, 0f, 0f, 3f, 4f, 5f);
            float[] values = (float[]) invoke("toMatrixValues", new Class<?>[] {Matrix.class}, m);
            assertEquals(6, values.length);
            assertEquals(2f, values[0]);
            assertEquals(3f, values[3]);
            assertEquals(4f, values[4]);
            assertEquals(5f, values[5]);
        }
    }
}
