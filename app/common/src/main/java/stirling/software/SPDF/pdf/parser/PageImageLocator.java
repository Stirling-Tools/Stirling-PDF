package stirling.software.SPDF.pdf.parser;

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
 * box in PDF user-space (origin bottom-left, Y up) by transforming the unit square through the
 * current transformation matrix (CTM).
 *
 * <p>Usage:
 *
 * <pre>{@code
 * PageImageLocator locator = new PageImageLocator(page, pageIndex);
 * locator.processPage(page);
 * List<ImageBox> boxes = locator.getImageBoxes();
 * }</pre>
 *
 * <p>Each {@link ImageBox} carries the 0-based page index and the axis-aligned bounding box {@code
 * (x1, y1, x2, y2)} in PDF user-space coordinates.
 */
public final class PageImageLocator extends PDFGraphicsStreamEngine {

    /**
     * Bounding box of a raster or vector image found on a PDF page.
     *
     * @param pageIndex 0-based page index
     * @param x1 left edge in PDF user-space (origin bottom-left)
     * @param y1 bottom edge in PDF user-space
     * @param x2 right edge
     * @param y2 top edge
     */
    public record ImageBox(int pageIndex, float x1, float y1, float x2, float y2) {}

    private final int pageIndex;
    private final List<ImageBox> imageBoxes = new ArrayList<>();
    private final Point2D.Float currentPoint = new Point2D.Float();

    /**
     * @param page the PDPage to process
     * @param pageIndex 0-based index of this page in the document (stored on each returned {@link
     *     ImageBox})
     */
    public PageImageLocator(PDPage page, int pageIndex) {
        super(page);
        this.pageIndex = pageIndex;
    }

    /** Returns all image bounding boxes collected during {@link #processPage}. */
    public List<ImageBox> getImageBoxes() {
        return imageBoxes;
    }

    @Override
    public void drawImage(PDImage pdImage) throws IOException {
        Matrix ctm = getGraphicsState().getCurrentTransformationMatrix();
        // An image occupies the unit square (0,0)→(1,1) in image space.
        // Transform all four corners through the CTM to get the page-space bounding box.
        float a = ctm.getScaleX();
        float b = ctm.getShearY();
        float c = ctm.getShearX();
        float d = ctm.getScaleY();
        float e = ctm.getTranslateX();
        float f = ctm.getTranslateY();
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
        imageBoxes.add(new ImageBox(pageIndex, x1, y1, x2, y2));
    }

    // ---------- required abstract methods (no-op for path operations) ----------

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
