package stirling.software.SPDF.service.pdfjson.type3;

import java.awt.geom.GeneralPath;
import java.awt.geom.Point2D;
import java.io.IOException;

import org.apache.pdfbox.contentstream.PDFGraphicsStreamEngine;
import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType3CharProc;
import org.apache.pdfbox.pdmodel.graphics.image.PDImage;
import org.apache.pdfbox.util.Matrix;
import org.apache.pdfbox.util.Vector;

import lombok.Getter;
import lombok.extern.slf4j.Slf4j;

@Slf4j
class Type3GraphicsEngine extends PDFGraphicsStreamEngine {

    private final GeneralPath accumulatedPath = new GeneralPath();
    private final GeneralPath linePath = new GeneralPath();
    private final Point2D.Float currentPoint = new Point2D.Float();
    private boolean hasCurrentPoint;
    @Getter private boolean sawStroke;
    @Getter private boolean sawFill;
    @Getter private boolean sawImage;
    @Getter private boolean sawText;
    @Getter private boolean sawShading;
    @Getter private String warnings;

    protected Type3GraphicsEngine(PDPage page) {
        super(page);
    }

    public GeneralPath getAccumulatedPath() {
        return (GeneralPath) accumulatedPath.clone();
    }

    public void process(PDType3CharProc charProc) throws IOException {
        accumulatedPath.reset();
        linePath.reset();
        sawStroke = false;
        sawFill = false;
        sawImage = false;
        sawText = false;
        sawShading = false;
        warnings = null;
        if (charProc != null) {
            processChildStream(charProc, getPage());
        }
    }

    @Override
    public void appendRectangle(Point2D p0, Point2D p1, Point2D p2, Point2D p3) throws IOException {
        moveTo((float) p0.getX(), (float) p0.getY());
        lineTo((float) p1.getX(), (float) p1.getY());
        lineTo((float) p2.getX(), (float) p2.getY());
        lineTo((float) p3.getX(), (float) p3.getY());
        closePath();
    }

    @Override
    public void drawImage(PDImage pdImage) throws IOException {
        sawImage = true;
    }

    @Override
    public void shadingFill(COSName shadingName) throws IOException {
        sawShading = true;
    }

    @Override
    public void strokePath() throws IOException {
        accumulatedPath.append(linePath, false);
        linePath.reset();
        sawStroke = true;
    }

    @Override
    public void fillPath(int windingRule) throws IOException {
        linePath.setWindingRule(
                windingRule == 0 ? GeneralPath.WIND_EVEN_ODD : GeneralPath.WIND_NON_ZERO);
        accumulatedPath.append(linePath, false);
        linePath.reset();
        sawFill = true;
    }

    @Override
    public void fillAndStrokePath(int windingRule) throws IOException {
        fillPath(windingRule);
        sawStroke = true;
    }

    @Override
    public void clip(int windingRule) throws IOException {
        // ignore
    }

    @Override
    public void moveTo(float x, float y) throws IOException {
        linePath.moveTo(x, y);
        currentPoint.setLocation(x, y);
        hasCurrentPoint = true;
    }

    @Override
    public void lineTo(float x, float y) throws IOException {
        linePath.lineTo(x, y);
        currentPoint.setLocation(x, y);
        hasCurrentPoint = true;
    }

    @Override
    public void curveTo(float x1, float y1, float x2, float y2, float x3, float y3)
            throws IOException {
        linePath.curveTo(x1, y1, x2, y2, x3, y3);
        currentPoint.setLocation(x3, y3);
        hasCurrentPoint = true;
    }

    @Override
    public Point2D getCurrentPoint() throws IOException {
        return hasCurrentPoint ? (Point2D) currentPoint.clone() : null;
    }

    @Override
    public void closePath() throws IOException {
        linePath.closePath();
    }

    @Override
    public void endPath() throws IOException {
        linePath.reset();
        hasCurrentPoint = false;
    }

    @Override
    protected void showText(byte[] string) throws IOException {
        sawText = true;
        super.showText(string);
    }

    @Override
    protected void showFontGlyph(
            Matrix textRenderingMatrix, PDFont font, int code, Vector displacement)
            throws IOException {
        sawText = true;
        super.showFontGlyph(textRenderingMatrix, font, code, displacement);
    }

    @Override
    protected void processOperator(
            Operator operator, java.util.List<org.apache.pdfbox.cos.COSBase> operands)
            throws IOException {
        if ("cm".equals(operator.getName())) {
            warnings =
                    warnings == null ? "Encountered CTM concatenation" : warnings + "; CTM concat";
        }
        super.processOperator(operator, operands);
    }
}
