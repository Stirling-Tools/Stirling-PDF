package stirling.software.SPDF.controller.api.security;

import java.awt.geom.Point2D;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.contentstream.PDFGraphicsStreamEngine;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.graphics.image.PDImage;
import org.apache.pdfbox.util.Matrix;

/**
 * PDFGraphicsStreamEngine that intercepts {@code drawImage} calls and records each image's bounding
 * box in PDF user-space (origin bottom-left, Y up) via the current transformation matrix.
 */
final class PageImageExtractor extends PDFGraphicsStreamEngine {

    private final List<float[]> imageBoxes = new ArrayList<>();
    private final Point2D.Float currentPoint = new Point2D.Float();

    PageImageExtractor(PDPage page) {
        super(page);
    }

    List<float[]> getImageBoxes() {
        return imageBoxes;
    }

    @Override
    public void drawImage(PDImage pdImage) throws IOException {
        Matrix ctm = getGraphicsState().getCurrentTransformationMatrix();
        float a = ctm.getScaleX(), b = ctm.getShearY();
        float c = ctm.getShearX(), d = ctm.getScaleY();
        float e = ctm.getTranslateX(), f = ctm.getTranslateY();
        float[] xs = {e, a + e, c + e, a + c + e};
        float[] ys = {f, b + f, d + f, b + d + f};
        float x1 = Float.MAX_VALUE, y1 = Float.MAX_VALUE;
        float x2 = -Float.MAX_VALUE, y2 = -Float.MAX_VALUE;
        for (float x : xs) {
            x1 = Math.min(x1, x);
            x2 = Math.max(x2, x);
        }
        for (float y : ys) {
            y1 = Math.min(y1, y);
            y2 = Math.max(y2, y);
        }
        imageBoxes.add(new float[] {x1, y1, x2, y2});
    }

    @Override
    public void appendRectangle(Point2D p0, Point2D p1, Point2D p2, Point2D p3) {}

    @Override
    public void clip(int windingRule) {}

    @Override
    public void moveTo(float x, float y) {
        currentPoint.setLocation(x, y);
    }

    @Override
    public void lineTo(float x, float y) {
        currentPoint.setLocation(x, y);
    }

    @Override
    public void curveTo(float x1, float y1, float x2, float y2, float x3, float y3) {
        currentPoint.setLocation(x3, y3);
    }

    @Override
    public Point2D getCurrentPoint() {
        return currentPoint;
    }

    @Override
    public void closePath() {}

    @Override
    public void endPath() {}

    @Override
    public void strokePath() {}

    @Override
    public void fillPath(int windingRule) {}

    @Override
    public void fillAndStrokePath(int windingRule) {}

    @Override
    public void shadingFill(COSName shadingName) {}
}
