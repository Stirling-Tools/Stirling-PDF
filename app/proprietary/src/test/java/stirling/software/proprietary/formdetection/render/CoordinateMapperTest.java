package stirling.software.proprietary.formdetection.render;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

import stirling.software.proprietary.formdetection.inference.Yolo;
import stirling.software.proprietary.formdetection.model.DetectedField;

class CoordinateMapperTest {

    @Test
    void mapsBitmapPixelsToPdfPointsWithYFlip() {
        // 200x300pt page rendered at 2 px/pt (400x600 px)
        PageRasterizer.RasterPage page =
                new PageRasterizer.RasterPage(0, new byte[0], 400, 600, 200f, 300f, 2f, 2f);
        // detection at top-left (10,20) px, 40x60 px
        Yolo.Detection d = new Yolo.Detection(0, 0.9f, 10f, 20f, 40f, 60f);

        DetectedField.RectPt r = CoordinateMapper.toPdfPoints(d, page);

        assertEquals(5.0, r.x(), 1e-4); // 10/2
        assertEquals(20.0, r.w(), 1e-4); // 40/2
        assertEquals(30.0, r.h(), 1e-4); // 60/2
        // Y flip: pageHeight - (yTopPx/scale) - hPt = 300 - 10 - 30
        assertEquals(260.0, r.y(), 1e-4);
    }

    @Test
    void clampsToPageBounds() {
        PageRasterizer.RasterPage page =
                new PageRasterizer.RasterPage(0, new byte[0], 200, 200, 100f, 100f, 2f, 2f);
        // box partly off the right/bottom edge in px
        Yolo.Detection d = new Yolo.Detection(0, 0.5f, 180f, 0f, 60f, 40f);

        DetectedField.RectPt r = CoordinateMapper.toPdfPoints(d, page);

        // x = 90pt, width clamped to 100-90 = 10pt
        assertEquals(90.0, r.x(), 1e-4);
        assertEquals(10.0, r.w(), 1e-4);
        // stays within the page
        org.junit.jupiter.api.Assertions.assertEquals(true, r.x() + r.w() <= 100.0 + 1e-6);
        org.junit.jupiter.api.Assertions.assertEquals(true, r.y() >= -1e-6);
    }
}
