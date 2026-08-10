package stirling.software.proprietary.formdetection.render;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.formdetection.inference.Yolo;
import stirling.software.proprietary.formdetection.model.DetectedField;

class CoordinateMapperTest {

    private static PageRasterizer.RasterPage page(
            int widthPx,
            int heightPx,
            float displayW,
            float displayH,
            float scale,
            int rotation,
            float userW,
            float userH,
            float llx,
            float lly) {
        return new PageRasterizer.RasterPage(
                0,
                new byte[0],
                widthPx,
                heightPx,
                displayW,
                displayH,
                scale,
                scale,
                rotation,
                userW,
                userH,
                llx,
                lly);
    }

    @Test
    void mapsBitmapPixelsToPdfPointsWithYFlip() {
        // 200x300pt page rendered at 2 px/pt (400x600 px)
        PageRasterizer.RasterPage p = page(400, 600, 200f, 300f, 2f, 0, 200f, 300f, 0f, 0f);
        // detection at top-left (10,20) px, 40x60 px
        Yolo.Detection d = new Yolo.Detection(0, 0.9f, 10f, 20f, 40f, 60f);

        DetectedField.RectPt r = CoordinateMapper.toPdfPoints(d, p);

        assertEquals(5.0, r.x(), 1e-4); // 10/2
        assertEquals(20.0, r.w(), 1e-4); // 40/2
        assertEquals(30.0, r.h(), 1e-4); // 60/2
        // Y flip: pageHeight - (yTopPx/scale) - hPt = 300 - 10 - 30
        assertEquals(260.0, r.y(), 1e-4);
    }

    @Test
    void clampsToPageBounds() {
        PageRasterizer.RasterPage p = page(200, 200, 100f, 100f, 2f, 0, 100f, 100f, 0f, 0f);
        // box partly off the right/bottom edge in px
        Yolo.Detection d = new Yolo.Detection(0, 0.5f, 180f, 0f, 60f, 40f);

        DetectedField.RectPt r = CoordinateMapper.toPdfPoints(d, p);

        // x = 90pt, width clamped to 100-90 = 10pt
        assertEquals(90.0, r.x(), 1e-4);
        assertEquals(10.0, r.w(), 1e-4);
        assertTrue(r.x() + r.w() <= 100.0 + 1e-6);
        assertTrue(r.y() >= -1e-6);
    }

    @Test
    void appliesCropBoxOrigin() {
        PageRasterizer.RasterPage p = page(400, 600, 200f, 300f, 2f, 0, 200f, 300f, 30f, 50f);
        Yolo.Detection d = new Yolo.Detection(0, 0.9f, 10f, 20f, 40f, 60f);

        DetectedField.RectPt r = CoordinateMapper.toPdfPoints(d, p);

        assertEquals(35.0, r.x(), 1e-4); // 5 + llx 30
        assertEquals(310.0, r.y(), 1e-4); // 260 + lly 50
        assertEquals(20.0, r.w(), 1e-4);
        assertEquals(30.0, r.h(), 1e-4);
    }

    @Test
    void invertsRotation90() {
        // Unrotated page 200x100; /Rotate 90 renders a 100x200pt display at 2 px/pt.
        PageRasterizer.RasterPage p = page(200, 400, 100f, 200f, 2f, 90, 200f, 100f, 0f, 0f);
        // User rect (10,20,30,40) lands at display rect (20,160,40,30) = bitmap (40,20,80,60).
        Yolo.Detection d = new Yolo.Detection(0, 0.9f, 40f, 20f, 80f, 60f);

        DetectedField.RectPt r = CoordinateMapper.toPdfPoints(d, p);

        assertEquals(10.0, r.x(), 1e-4);
        assertEquals(20.0, r.y(), 1e-4);
        assertEquals(30.0, r.w(), 1e-4);
        assertEquals(40.0, r.h(), 1e-4);
    }

    @Test
    void invertsRotation180() {
        PageRasterizer.RasterPage p = page(200, 300, 200f, 300f, 1f, 180, 200f, 300f, 0f, 0f);
        // User rect (10,20,30,40) lands at display rect (160,240,30,40) = bitmap (160,20,30,40).
        Yolo.Detection d = new Yolo.Detection(0, 0.9f, 160f, 20f, 30f, 40f);

        DetectedField.RectPt r = CoordinateMapper.toPdfPoints(d, p);

        assertEquals(10.0, r.x(), 1e-4);
        assertEquals(20.0, r.y(), 1e-4);
        assertEquals(30.0, r.w(), 1e-4);
        assertEquals(40.0, r.h(), 1e-4);
    }

    @Test
    void invertsRotation270() {
        PageRasterizer.RasterPage p = page(200, 400, 100f, 200f, 2f, 270, 200f, 100f, 0f, 0f);
        // User rect (10,20,30,40) lands at display rect (40,10,40,30) = bitmap (80,320,80,60).
        Yolo.Detection d = new Yolo.Detection(0, 0.9f, 80f, 320f, 80f, 60f);

        DetectedField.RectPt r = CoordinateMapper.toPdfPoints(d, p);

        assertEquals(10.0, r.x(), 1e-4);
        assertEquals(20.0, r.y(), 1e-4);
        assertEquals(30.0, r.w(), 1e-4);
        assertEquals(40.0, r.h(), 1e-4);
    }
}
