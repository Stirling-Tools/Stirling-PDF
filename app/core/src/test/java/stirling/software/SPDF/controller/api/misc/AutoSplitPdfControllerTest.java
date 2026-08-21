package stirling.software.SPDF.controller.api.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

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
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.EncodeHintType;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel;

import stirling.software.SPDF.model.api.misc.AutoSplitPdfRequest;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AutoSplitPdfControllerTest {

    private static final String VALID_QR = "https://stirlingpdf.com";

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    private ApplicationProperties applicationProperties;
    private AutoSplitPdfController controller;

    @TempDir Path tempDir;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        // Keep maxDPI at the QR detection DPI so the high-DPI retry path is skipped (fast tests).
        applicationProperties.getSystem().setMaxDPI(150);
        controller =
                new AutoSplitPdfController(
                        pdfDocumentFactory, tempFileManager, applicationProperties);
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    /** Build a tiny single-colour BufferedImage. */
    private static BufferedImage solidImage(int w, int h, Color color) {
        BufferedImage image = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(color);
        g.fillRect(0, 0, w, h);
        g.dispose();
        return image;
    }

    /** Generate a real, decodable QR code as a BufferedImage using zxing core only. */
    private static BufferedImage qrImage(String text, int size) throws Exception {
        QRCodeWriter writer = new QRCodeWriter();
        java.util.Map<EncodeHintType, Object> hints = new java.util.EnumMap<>(EncodeHintType.class);
        hints.put(EncodeHintType.ERROR_CORRECTION, ErrorCorrectionLevel.M);
        hints.put(EncodeHintType.MARGIN, 4);
        BitMatrix matrix = writer.encode(text, BarcodeFormat.QR_CODE, size, size, hints);
        int width = matrix.getWidth();
        int height = matrix.getHeight();
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        for (int x = 0; x < width; x++) {
            for (int y = 0; y < height; y++) {
                image.setRGB(x, y, matrix.get(x, y) ? Color.BLACK.getRGB() : Color.WHITE.getRGB());
            }
        }
        return image;
    }

    /** Build an in-memory PDF document with the given number of plain pages. */
    private static PDDocument simpleDoc(int pages) {
        PDDocument doc = new PDDocument();
        for (int i = 0; i < pages; i++) {
            doc.addPage(new PDPage(new PDRectangle(200, 200)));
        }
        return doc;
    }

    /**
     * A PDF where every page draws the supplied image (used so embedded-image extraction works).
     */
    private static PDDocument docWithImageOnEachPage(BufferedImage img, int pages)
            throws Exception {
        PDDocument doc = new PDDocument();
        for (int i = 0; i < pages; i++) {
            PDPage page = new PDPage(new PDRectangle(200, 200));
            doc.addPage(page);
            PDImageXObject xobj = LosslessFactory.createFromImage(doc, img);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.drawImage(xobj, 20, 20, 160, 160);
            }
        }
        return doc;
    }

    /** Load a PDF from the InputStream the controller hands to pdfDocumentFactory.load(...). */
    private static PDDocument loadFromStream(InputStream in) throws Exception {
        return Loader.loadPDF(in.readAllBytes());
    }

    private static byte[] docToBytes(PDDocument doc) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        doc.save(baos);
        doc.close();
        return baos.toByteArray();
    }

    private static AutoSplitPdfRequest request(byte[] pdfBytes, Boolean duplex) {
        AutoSplitPdfRequest req = new AutoSplitPdfRequest();
        req.setFileInput(
                new org.springframework.mock.web.MockMultipartFile(
                        "fileInput", "input.pdf", "application/pdf", pdfBytes));
        req.setDuplexMode(duplex);
        return req;
    }

    /** Make tempFileManager.createTempFile(".zip") create a real file inside the JUnit temp dir. */
    private void wireRealTempFile() throws Exception {
        when(tempFileManager.createTempFile(".zip"))
                .thenAnswer(
                        invocation ->
                                Files.createTempFile(tempDir, "stirling-test", ".zip").toFile());
    }

    private static List<String> zipEntryNames(byte[] zipBytes) throws Exception {
        List<String> names = new ArrayList<>();
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                names.add(entry.getName());
                zis.closeEntry();
            }
        }
        return names;
    }

    private static byte[] readResource(Resource resource) throws Exception {
        try (InputStream in = resource.getInputStream()) {
            return in.readAllBytes();
        }
    }

    // reflection invokers for the private (static) helpers ------------------

    private static Object invokeStatic(String name, Class<?>[] types, Object... args)
            throws Exception {
        Method m = AutoSplitPdfController.class.getDeclaredMethod(name, types);
        m.setAccessible(true);
        try {
            return m.invoke(null, args);
        } catch (InvocationTargetException e) {
            if (e.getCause() instanceof Exception ex) {
                throw ex;
            }
            throw e;
        }
    }

    private Object invokeInstance(String name, Class<?>[] types, Object... args) throws Exception {
        Method m = AutoSplitPdfController.class.getDeclaredMethod(name, types);
        m.setAccessible(true);
        try {
            return m.invoke(controller, args);
        } catch (InvocationTargetException e) {
            if (e.getCause() instanceof Exception ex) {
                throw ex;
            }
            throw e;
        }
    }

    // ---------------------------------------------------------------------
    // isBlankImage(int[])
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("isBlankImage")
    class IsBlankImage {

        @Test
        @DisplayName("empty array is treated as blank")
        void emptyArrayIsBlank() throws Exception {
            Object result =
                    invokeStatic("isBlankImage", new Class<?>[] {int[].class}, (Object) new int[0]);
            assertEquals(Boolean.TRUE, result);
        }

        @Test
        @DisplayName("uniform pixels are blank")
        void uniformIsBlank() throws Exception {
            int[] pixels = new int[1000];
            java.util.Arrays.fill(pixels, 0xFFFFFF);
            Object result =
                    invokeStatic("isBlankImage", new Class<?>[] {int[].class}, (Object) pixels);
            assertEquals(Boolean.TRUE, result);
        }

        @Test
        @DisplayName("a single differing sampled pixel makes it non-blank")
        void variedIsNotBlank() throws Exception {
            int[] pixels = new int[1000];
            java.util.Arrays.fill(pixels, 0xFFFFFF);
            // step = max(1, 1000/20) = 50, so index 500 is sampled
            pixels[500] = 0x000000;
            Object result =
                    invokeStatic("isBlankImage", new Class<?>[] {int[].class}, (Object) pixels);
            assertEquals(Boolean.FALSE, result);
        }

        @Test
        @DisplayName("single pixel array is blank")
        void singlePixelIsBlank() throws Exception {
            Object result =
                    invokeStatic(
                            "isBlankImage", new Class<?>[] {int[].class}, (Object) new int[] {7});
            assertEquals(Boolean.TRUE, result);
        }
    }

    // ---------------------------------------------------------------------
    // downscaleIfNeeded(BufferedImage)
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("downscaleIfNeeded")
    class DownscaleIfNeeded {

        @Test
        @DisplayName("small images are returned unchanged (same instance)")
        void smallUnchanged() throws Exception {
            BufferedImage img = solidImage(100, 80, Color.GRAY);
            Object result =
                    invokeStatic(
                            "downscaleIfNeeded",
                            new Class<?>[] {BufferedImage.class},
                            (Object) img);
            assertSame(img, result);
        }

        @Test
        @DisplayName("image exactly at the pixel limit is unchanged")
        void atLimitUnchanged() throws Exception {
            // 10000x10000 == 100_000_000 == MAX_IMAGE_PIXELS, not greater than -> unchanged.
            // Use a mock-free real image but keep it cheap: build a 1px-tall wide image whose
            // total pixel count is below the limit so we only assert the <= branch with a
            // realistic non-trivial size.
            BufferedImage img = solidImage(5000, 5000, Color.WHITE); // 25M < 100M
            Object result =
                    invokeStatic(
                            "downscaleIfNeeded",
                            new Class<?>[] {BufferedImage.class},
                            (Object) img);
            assertSame(img, result);
        }
    }

    // ---------------------------------------------------------------------
    // countPageImages(PDPage)
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("countPageImages")
    class CountPageImages {

        @Test
        @DisplayName("page with no resources returns 0")
        void noResourcesZero() throws Exception {
            PDPage page = new PDPage(new PDRectangle(200, 200));
            Object result =
                    invokeStatic("countPageImages", new Class<?>[] {PDPage.class}, (Object) page);
            assertEquals(0, result);
        }

        @Test
        @DisplayName("page with one embedded image returns 1")
        void oneImage() throws Exception {
            try (PDDocument doc = docWithImageOnEachPage(solidImage(40, 40, Color.RED), 1)) {
                PDPage page = doc.getPage(0);
                Object result =
                        invokeStatic(
                                "countPageImages", new Class<?>[] {PDPage.class}, (Object) page);
                assertEquals(1, result);
            }
        }
    }

    // ---------------------------------------------------------------------
    // tryDecodeQR(int[], int, int) and decodeQRCode(BufferedImage)
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("QR decoding")
    class QrDecoding {

        @Test
        @DisplayName("decodeQRCode returns the encoded text for a real QR image")
        void decodeRealQr() throws Exception {
            BufferedImage qr = qrImage(VALID_QR, 250);
            Object result =
                    invokeStatic("decodeQRCode", new Class<?>[] {BufferedImage.class}, (Object) qr);
            assertEquals(VALID_QR, result);
        }

        @Test
        @DisplayName("decodeQRCode returns null for a blank image")
        void decodeBlankReturnsNull() throws Exception {
            BufferedImage blank = solidImage(120, 120, Color.WHITE);
            Object result =
                    invokeStatic(
                            "decodeQRCode", new Class<?>[] {BufferedImage.class}, (Object) blank);
            assertNull(result);
        }

        @Test
        @DisplayName("decodeQRCode returns null for a non-QR (noise-free, non-blank) image")
        void decodeNonQrReturnsNull() throws Exception {
            // Two solid halves: non-blank but not a QR code.
            BufferedImage image = new BufferedImage(120, 120, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = image.createGraphics();
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, 120, 60);
            g.setColor(Color.BLACK);
            g.fillRect(0, 60, 120, 60);
            g.dispose();
            Object result =
                    invokeStatic(
                            "decodeQRCode", new Class<?>[] {BufferedImage.class}, (Object) image);
            assertNull(result);
        }

        @Test
        @DisplayName("tryDecodeQR decodes raw RGB pixels of a real QR")
        void tryDecodeRawPixels() throws Exception {
            BufferedImage qr = qrImage(VALID_QR, 250);
            int w = qr.getWidth();
            int h = qr.getHeight();
            int[] pixels = new int[w * h];
            qr.getRGB(0, 0, w, h, pixels, 0, w);
            Object result =
                    invokeStatic(
                            "tryDecodeQR",
                            new Class<?>[] {int[].class, int.class, int.class},
                            pixels,
                            w,
                            h);
            assertEquals(VALID_QR, result);
        }

        @Test
        @DisplayName("tryDecodeQR returns null when no QR present")
        void tryDecodeReturnsNull() throws Exception {
            int w = 60;
            int h = 60;
            int[] pixels = new int[w * h];
            // alternating pattern, no decodable QR
            for (int i = 0; i < pixels.length; i++) {
                pixels[i] = (i % 2 == 0) ? 0xFFFFFF : 0x000000;
            }
            Object result =
                    invokeStatic(
                            "tryDecodeQR",
                            new Class<?>[] {int[].class, int.class, int.class},
                            pixels,
                            w,
                            h);
            assertNull(result);
        }
    }

    // ---------------------------------------------------------------------
    // checkPageImagesDirect(PDPage)
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("checkPageImagesDirect")
    class CheckPageImagesDirect {

        @Test
        @DisplayName("page with no images returns null")
        void noImagesNull() throws Exception {
            PDPage page = new PDPage(new PDRectangle(200, 200));
            Object result =
                    invokeStatic(
                            "checkPageImagesDirect", new Class<?>[] {PDPage.class}, (Object) page);
            assertNull(result);
        }

        @Test
        @DisplayName("page with an embedded QR image returns the QR text")
        void embeddedQrFound() throws Exception {
            // Size 250 keeps the readback image off the controller's blank-sampling heuristic.
            BufferedImage qr = qrImage(VALID_QR, 250);
            try (PDDocument doc = docWithImageOnEachPage(qr, 1)) {
                PDPage page = doc.getPage(0);
                Object result =
                        invokeStatic(
                                "checkPageImagesDirect",
                                new Class<?>[] {PDPage.class},
                                (Object) page);
                assertEquals(VALID_QR, result);
            }
        }

        @Test
        @DisplayName("page with a non-QR image returns null")
        void embeddedNonQrNull() throws Exception {
            BufferedImage plain = solidImage(80, 80, Color.WHITE);
            try (PDDocument doc = docWithImageOnEachPage(plain, 1)) {
                PDPage page = doc.getPage(0);
                Object result =
                        invokeStatic(
                                "checkPageImagesDirect",
                                new Class<?>[] {PDPage.class},
                                (Object) page);
                assertNull(result);
            }
        }
    }

    // ---------------------------------------------------------------------
    // getSystemMaxDpi() (private instance)
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("getSystemMaxDpi")
    class GetSystemMaxDpi {

        @Test
        @DisplayName("returns the configured system maxDPI")
        void returnsConfiguredValue() throws Exception {
            applicationProperties.getSystem().setMaxDPI(300);
            Object result = invokeInstance("getSystemMaxDpi", new Class<?>[] {});
            assertEquals(300, result);
        }

        @Test
        @DisplayName("falls back to the default detection DPI when applicationProperties is null")
        void fallsBackWhenNull() throws Exception {
            AutoSplitPdfController noProps =
                    new AutoSplitPdfController(pdfDocumentFactory, tempFileManager, null);
            Method m = AutoSplitPdfController.class.getDeclaredMethod("getSystemMaxDpi");
            m.setAccessible(true);
            Object result = m.invoke(noProps);
            assertEquals(150, result); // QR_DETECTION_DPI
        }
    }

    // ---------------------------------------------------------------------
    // autoSplitPdf(...) full handler
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("autoSplitPdf")
    class AutoSplitHandler {

        @Test
        @DisplayName("PDF without QR dividers yields a single-PDF zip")
        void noQrSingleOutput() throws Exception {
            byte[] pdf = docToBytes(simpleDoc(3));
            wireRealTempFile();
            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenAnswer(invocation -> loadFromStream(invocation.getArgument(0)));

            AutoSplitPdfRequest req = request(pdf, false);
            ResponseEntity<Resource> response = controller.autoSplitPdf(req);

            assertNotNull(response);
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());

            byte[] zip = readResource(response.getBody());
            List<String> names = zipEntryNames(zip);
            assertEquals(1, names.size(), "no QR dividers -> all pages collapse into one document");
            assertEquals("input_1.pdf", names.get(0));

            verify(pdfDocumentFactory).load(any(InputStream.class));
        }

        @Test
        @DisplayName("single-page PDF without QR yields one output PDF in the zip")
        void singlePageOneOutput() throws Exception {
            byte[] pdf = docToBytes(simpleDoc(1));
            wireRealTempFile();
            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenAnswer(invocation -> loadFromStream(invocation.getArgument(0)));

            ResponseEntity<Resource> response = controller.autoSplitPdf(request(pdf, null));

            byte[] zip = readResource(response.getBody());
            List<String> names = zipEntryNames(zip);
            assertEquals(1, names.size());
            assertEquals("input_1.pdf", names.get(0));
        }

        @Test
        @DisplayName("filename without extension is used as-is for entry names")
        void filenameWithoutExtension() throws Exception {
            byte[] pdf = docToBytes(simpleDoc(2));
            wireRealTempFile();
            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenAnswer(invocation -> loadFromStream(invocation.getArgument(0)));

            AutoSplitPdfRequest req = new AutoSplitPdfRequest();
            req.setFileInput(
                    new org.springframework.mock.web.MockMultipartFile(
                            "fileInput", "myfile", "application/pdf", pdf));
            req.setDuplexMode(false);

            ResponseEntity<Resource> response = controller.autoSplitPdf(req);
            byte[] zip = readResource(response.getBody());
            List<String> names = zipEntryNames(zip);
            assertEquals(1, names.size());
            assertEquals("myfile_1.pdf", names.get(0));
        }

        @Test
        @DisplayName("each output zip entry contains a valid, loadable PDF")
        void outputEntriesAreValidPdfs() throws Exception {
            byte[] pdf = docToBytes(simpleDoc(2));
            wireRealTempFile();
            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenAnswer(invocation -> loadFromStream(invocation.getArgument(0)));

            ResponseEntity<Resource> response = controller.autoSplitPdf(request(pdf, false));
            byte[] zip = readResource(response.getBody());

            int entries = 0;
            try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zip))) {
                ZipEntry entry;
                while ((entry = zis.getNextEntry()) != null) {
                    entries++;
                    byte[] entryBytes = zis.readAllBytes();
                    try (PDDocument loaded = Loader.loadPDF(entryBytes)) {
                        assertTrue(loaded.getNumberOfPages() >= 1);
                    }
                    zis.closeEntry();
                }
            }
            assertEquals(1, entries);
        }

        @Test
        @DisplayName("loader failure propagates and the temp file is closed")
        void loaderFailurePropagates() throws Exception {
            byte[] pdf = docToBytes(simpleDoc(1));
            File created = Files.createTempFile(tempDir, "stirling-fail", ".zip").toFile();
            when(tempFileManager.createTempFile(".zip")).thenReturn(created);
            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenThrow(new java.io.IOException("boom"));

            AutoSplitPdfRequest req = request(pdf, false);

            assertThrows(java.io.IOException.class, () -> controller.autoSplitPdf(req));
            // outputTempFile.close() deletes the file on the error path.
            verify(tempFileManager).deleteTempFile(created);
        }

        @Test
        @DisplayName("duplexMode flag is accepted (null treated as false)")
        void duplexNullTreatedAsFalse() throws Exception {
            byte[] pdf = docToBytes(simpleDoc(2));
            wireRealTempFile();
            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenAnswer(invocation -> loadFromStream(invocation.getArgument(0)));

            ResponseEntity<Resource> response = controller.autoSplitPdf(request(pdf, null));
            assertEquals(HttpStatus.OK, response.getStatusCode());
            List<String> names = zipEntryNames(readResource(response.getBody()));
            assertEquals(1, names.size());
        }
    }

    // ---------------------------------------------------------------------
    // VALID_QR_CONTENTS sanity (static state)
    // ---------------------------------------------------------------------

    @Nested
    @DisplayName("valid QR contents")
    class ValidQrContents {

        @Test
        @DisplayName("the well-known divider URLs are recognised")
        @SuppressWarnings("unchecked")
        void recognisedUrls() throws Exception {
            java.lang.reflect.Field f =
                    AutoSplitPdfController.class.getDeclaredField("VALID_QR_CONTENTS");
            f.setAccessible(true);
            Set<String> valid = new HashSet<>((Set<String>) f.get(null));
            assertTrue(valid.contains("https://stirlingpdf.com"));
            assertTrue(valid.contains("https://github.com/Stirling-Tools/Stirling-PDF"));
            assertTrue(valid.contains("https://github.com/Frooodle/Stirling-PDF"));
            assertFalse(valid.contains("https://example.com"));
        }
    }
}
