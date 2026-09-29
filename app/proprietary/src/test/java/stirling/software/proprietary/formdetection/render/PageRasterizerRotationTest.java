package stirling.software.proprietary.formdetection.render;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.proprietary.formdetection.inference.Yolo;
import stirling.software.proprietary.formdetection.model.DetectedField;

/**
 * End-to-end geometry check: render a black rectangle on rotated, crop-shifted pages through real
 * PDFium, find it in the bitmap, and assert the mapper recovers its user-space rect.
 */
class PageRasterizerRotationTest {

    private static final float RECT_X = 60f;
    private static final float RECT_Y = 90f;
    private static final float RECT_W = 72f;
    private static final float RECT_H = 36f;

    private PageRasterizer rasterizer() {
        CustomPDFDocumentFactory factory =
                new CustomPDFDocumentFactory(mock(PdfMetadataService.class));
        return new PageRasterizer(factory);
    }

    /** Gather the streamed pages; these fixtures are one page, so holding them all is fine. */
    private List<PageRasterizer.RasterPage> collect(byte[] pdf) {
        List<PageRasterizer.RasterPage> pages = new ArrayList<>();
        rasterizer().rasterize(pdf, 1216, 100, pages::add);
        return pages;
    }

    private static byte[] pdfWithBlackRect(int rotation, float llx, float lly) throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(new PDRectangle(llx, lly, 200f, 300f));
            page.setRotation(rotation);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.setNonStrokingColor(0f, 0f, 0f);
                cs.addRect(llx + RECT_X, lly + RECT_Y, RECT_W, RECT_H);
                cs.fill();
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return out.toByteArray();
        }
    }

    private static boolean pdfiumAvailable() {
        try {
            Class.forName("stirling.software.jpdfium.PdfDocument");
            stirling.software.jpdfium.PdfDocument.open(minimalPdf()).close();
            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    private static byte[] minimalPdf() {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A6));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** Bounding box of dark pixels in an RGBA bitmap, as a top-left-origin px detection. */
    private static Yolo.Detection darkBoundingBox(byte[] rgba, int w, int h) {
        int minX = Integer.MAX_VALUE;
        int minY = Integer.MAX_VALUE;
        int maxX = -1;
        int maxY = -1;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int i = (y * w + x) * 4;
                int r = rgba[i] & 0xFF;
                int g = rgba[i + 1] & 0xFF;
                int b = rgba[i + 2] & 0xFF;
                if (r < 60 && g < 60 && b < 60) {
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }
            }
        }
        assertTrue(maxX >= 0, "expected a dark rectangle in the rendered bitmap");
        return new Yolo.Detection(0, 1f, minX, minY, maxX - minX + 1f, maxY - minY + 1f);
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 90, 180, 270})
    void recoversUserSpaceRectOnRotatedPages(int rotation) throws Exception {
        assumeTrue(pdfiumAvailable(), "JPDFium native not available on this platform");

        byte[] pdf = pdfWithBlackRect(rotation, 0f, 0f);
        List<PageRasterizer.RasterPage> pages = collect(pdf);
        assertEquals(1, pages.size());
        PageRasterizer.RasterPage page = pages.get(0);
        assertEquals(rotation, page.rotationDegrees());

        Yolo.Detection d = darkBoundingBox(page.rgba(), page.widthPx(), page.heightPx());
        DetectedField.RectPt r = CoordinateMapper.toPdfPoints(d, page);

        // Rendering + pixel-bbox rounding costs a couple of points of precision.
        assertEquals(RECT_X, r.x(), 2.0);
        assertEquals(RECT_Y, r.y(), 2.0);
        assertEquals(RECT_W, r.w(), 3.0);
        assertEquals(RECT_H, r.h(), 3.0);
    }

    @Test
    void recoversUserSpaceRectWithShiftedCropBoxOrigin() throws Exception {
        assumeTrue(pdfiumAvailable(), "JPDFium native not available on this platform");

        float llx = 25f;
        float lly = 40f;
        byte[] pdf = pdfWithBlackRect(0, llx, lly);
        // Sanity: the crop box PDFBox reports really is shifted.
        try (PDDocument check = Loader.loadPDF(pdf)) {
            assertEquals(llx, check.getPage(0).getCropBox().getLowerLeftX(), 1e-3);
        }

        List<PageRasterizer.RasterPage> pages = collect(pdf);
        PageRasterizer.RasterPage page = pages.get(0);
        assertEquals(llx, page.cropLlxPt(), 1e-3);
        assertEquals(lly, page.cropLlyPt(), 1e-3);

        Yolo.Detection d = darkBoundingBox(page.rgba(), page.widthPx(), page.heightPx());
        DetectedField.RectPt r = CoordinateMapper.toPdfPoints(d, page);

        // The recovered rect is absolute user space: crop-box origin included.
        assertEquals(llx + RECT_X, r.x(), 2.0);
        assertEquals(lly + RECT_Y, r.y(), 2.0);
        assertEquals(RECT_W, r.w(), 3.0);
        assertEquals(RECT_H, r.h(), 3.0);
    }

    @Test
    void rejectsAnOverLongDocumentWithoutRenderingAnyPage() throws Exception {
        assumeTrue(pdfiumAvailable(), "JPDFium native not available on this platform");

        byte[] pdf = pdfWithPages(3);
        AtomicInteger rendered = new AtomicInteger();

        assertThrows(
                PageRasterizer.PageLimitExceededException.class,
                () -> rasterizer().rasterize(pdf, 1216, 2, page -> rendered.incrementAndGet()));
        // The whole point of the limit: refuse before paying for any bitmap.
        assertEquals(0, rendered.get());
    }

    @Test
    void rejectsEmptyAndCorruptInputAsUnreadableRatherThanFailingLater() {
        assertThrows(
                PageRasterizer.UnreadablePdfException.class,
                () -> rasterizer().rasterize(new byte[0], 1216, 10, page -> {}));
        assertThrows(
                PageRasterizer.UnreadablePdfException.class,
                () -> rasterizer().rasterize("not a pdf".getBytes(), 1216, 10, page -> {}));
    }

    @Test
    void streamsPagesOneAtATime() throws Exception {
        assumeTrue(pdfiumAvailable(), "JPDFium native not available on this platform");

        byte[] pdf = pdfWithPages(3);
        List<Integer> seen = new ArrayList<>();
        rasterizer().rasterize(pdf, 1216, 10, page -> seen.add(page.pageIndex()));

        assertEquals(List.of(0, 1, 2), seen);
    }

    private static byte[] pdfWithPages(int count) throws Exception {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < count; i++) {
                doc.addPage(new PDPage(PDRectangle.A6));
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return out.toByteArray();
        }
    }
}
