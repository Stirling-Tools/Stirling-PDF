package stirling.software.proprietary.formdetection.render;

import stirling.software.proprietary.formdetection.inference.Yolo;
import stirling.software.proprietary.formdetection.model.DetectedField;

/**
 * Maps a detection (rendered bitmap pixels, top-left origin) to PDF points in unrotated user space
 * (bottom-left origin, crop-box offset applied) - the space PDFBox and pdf-lib widget rectangles
 * live in. The bitmap is display space: /Rotate baked in and the crop box anchored at (0,0), so the
 * mapping is scale + Y-flip, then the inverse page rotation, then the crop-box translation.
 */
public final class CoordinateMapper {

    private CoordinateMapper() {}

    public static DetectedField.RectPt toPdfPoints(
            Yolo.Detection d, PageRasterizer.RasterPage page) {
        float sx = page.scaleX() > 0 ? page.scaleX() : 1f;
        float sy = page.scaleY() > 0 ? page.scaleY() : 1f;

        // Bitmap px -> display-space points (bottom-left origin via Y flip).
        double wd = d.w() / sx;
        double hd = d.h() / sy;
        double xd = d.x() / sx;
        double yd = page.pageHeightPt() - (d.y() / sy) - hd;

        // Display space -> unrotated user space (inverse of the /Rotate the renderer applied).
        double uw = page.userWidthPt() > 0 ? page.userWidthPt() : page.pageWidthPt();
        double uh = page.userHeightPt() > 0 ? page.userHeightPt() : page.pageHeightPt();
        double x;
        double y;
        double w;
        double h;
        switch (page.rotationDegrees()) {
            case 90 -> {
                x = uw - yd - hd;
                y = xd;
                w = hd;
                h = wd;
            }
            case 180 -> {
                x = uw - xd - wd;
                y = uh - yd - hd;
                w = wd;
                h = hd;
            }
            case 270 -> {
                x = yd;
                y = uh - xd - wd;
                w = hd;
                h = wd;
            }
            default -> {
                x = xd;
                y = yd;
                w = wd;
                h = hd;
            }
        }

        // Clamp inside the crop box, then translate by its lower-left origin.
        x = clamp(x, 0, uw);
        y = clamp(y, 0, uh);
        w = clamp(w, 0, uw - x);
        h = clamp(h, 0, uh - y);
        return new DetectedField.RectPt(x + page.cropLlxPt(), y + page.cropLlyPt(), w, h);
    }

    private static double clamp(double v, double lo, double hi) {
        return v < lo ? lo : Math.min(v, hi);
    }
}
