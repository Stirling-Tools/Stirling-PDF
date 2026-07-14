package stirling.software.proprietary.formdetection.render;

import stirling.software.proprietary.formdetection.inference.Yolo;
import stirling.software.proprietary.formdetection.model.DetectedField;

/**
 * Maps a detection (original bitmap pixels, top-left origin) to PDF points (bottom-left origin),
 * accounting for the render scale and the top-left vs bottom-left origin flip.
 */
public final class CoordinateMapper {

    private CoordinateMapper() {}

    public static DetectedField.RectPt toPdfPoints(
            Yolo.Detection d, PageRasterizer.RasterPage page) {
        float sx = page.scaleX() > 0 ? page.scaleX() : 1f;
        float sy = page.scaleY() > 0 ? page.scaleY() : 1f;

        double wPt = d.w() / sx;
        double hPt = d.h() / sy;
        double xPt = d.x() / sx;
        // Flip Y: bitmap origin is top-left, PDF origin is bottom-left.
        double yPt = page.pageHeightPt() - (d.y() / sy) - hPt;

        xPt = clamp(xPt, 0, page.pageWidthPt());
        yPt = clamp(yPt, 0, page.pageHeightPt());
        wPt = clamp(wPt, 0, page.pageWidthPt() - xPt);
        hPt = clamp(hPt, 0, page.pageHeightPt() - yPt);
        return new DetectedField.RectPt(xPt, yPt, wPt, hPt);
    }

    private static double clamp(double v, double lo, double hi) {
        return v < lo ? lo : Math.min(v, hi);
    }
}
