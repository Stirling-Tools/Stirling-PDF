package stirling.software.SPDF.service.pdfjson.type3;

import static org.junit.jupiter.api.Assertions.*;

import java.awt.geom.GeneralPath;
import java.awt.geom.PathIterator;
import java.awt.geom.Point2D;
import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class Type3GraphicsEngineTest {

    private Type3GraphicsEngine engine;

    @BeforeEach
    void setUp() {
        engine = new Type3GraphicsEngine(new PDPage(new PDRectangle()));
    }

    @Test
    void initialState_noFlags() {
        assertFalse(engine.isSawStroke());
        assertFalse(engine.isSawFill());
        assertFalse(engine.isSawImage());
        assertFalse(engine.isSawText());
        assertFalse(engine.isSawShading());
        assertNull(engine.getWarnings());
    }

    @Test
    void getCurrentPoint_initiallyNull() throws IOException {
        assertNull(engine.getCurrentPoint());
    }

    @Test
    void moveTo_setsCurrentPoint() throws IOException {
        engine.moveTo(10f, 20f);
        Point2D pt = engine.getCurrentPoint();
        assertNotNull(pt);
        assertEquals(10f, pt.getX(), 0.001);
        assertEquals(20f, pt.getY(), 0.001);
    }

    @Test
    void lineTo_updatesCurrentPoint() throws IOException {
        engine.moveTo(0f, 0f);
        engine.lineTo(5f, 10f);
        Point2D pt = engine.getCurrentPoint();
        assertEquals(5f, pt.getX(), 0.001);
        assertEquals(10f, pt.getY(), 0.001);
    }

    @Test
    void curveTo_updatesCurrentPoint() throws IOException {
        engine.moveTo(0f, 0f);
        engine.curveTo(1f, 2f, 3f, 4f, 5f, 6f);
        Point2D pt = engine.getCurrentPoint();
        assertEquals(5f, pt.getX(), 0.001);
        assertEquals(6f, pt.getY(), 0.001);
    }

    @Test
    void strokePath_setsSawStrokeAndAccumulatesPath() throws IOException {
        engine.moveTo(0f, 0f);
        engine.lineTo(10f, 10f);
        engine.strokePath();
        assertTrue(engine.isSawStroke());
        GeneralPath path = engine.getAccumulatedPath();
        assertFalse(path.getBounds2D().isEmpty());
    }

    @Test
    void fillPath_setsSawFill() throws IOException {
        engine.moveTo(0f, 0f);
        engine.lineTo(10f, 0f);
        engine.lineTo(10f, 10f);
        engine.closePath();
        engine.fillPath(1);
        assertTrue(engine.isSawFill());
    }

    @Test
    void fillAndStrokePath_setsBothFlags() throws IOException {
        engine.moveTo(0f, 0f);
        engine.lineTo(10f, 0f);
        engine.lineTo(10f, 10f);
        engine.closePath();
        engine.fillAndStrokePath(0);
        assertTrue(engine.isSawFill());
        assertTrue(engine.isSawStroke());
    }

    @Test
    void drawImage_setsSawImage() throws IOException {
        engine.drawImage(null);
        assertTrue(engine.isSawImage());
    }

    @Test
    void shadingFill_setsSawShading() throws IOException {
        engine.shadingFill(null);
        assertTrue(engine.isSawShading());
    }

    @Test
    void endPath_resetsCurrentPoint() throws IOException {
        engine.moveTo(5f, 5f);
        assertNotNull(engine.getCurrentPoint());
        engine.endPath();
        assertNull(engine.getCurrentPoint());
    }

    @Test
    void getAccumulatedPath_returnsCopy() throws IOException {
        engine.moveTo(0f, 0f);
        engine.lineTo(10f, 10f);
        engine.strokePath();
        GeneralPath p1 = engine.getAccumulatedPath();
        GeneralPath p2 = engine.getAccumulatedPath();
        assertNotSame(p1, p2);
    }

    @Test
    void appendRectangle_createsClosedPath() throws IOException {
        Point2D p0 = new Point2D.Float(0f, 0f);
        Point2D p1 = new Point2D.Float(10f, 0f);
        Point2D p2 = new Point2D.Float(10f, 10f);
        Point2D p3 = new Point2D.Float(0f, 10f);
        engine.appendRectangle(p0, p1, p2, p3);
        engine.strokePath();
        GeneralPath path = engine.getAccumulatedPath();
        assertFalse(path.getBounds2D().isEmpty());
    }

    @Test
    void process_withNullCharProc_doesNotThrow() throws IOException {
        engine.process(null);
        assertFalse(engine.isSawStroke());
        assertFalse(engine.isSawFill());
    }

    @Test
    void fillPath_evenOddWindingRule() throws IOException {
        engine.moveTo(0f, 0f);
        engine.lineTo(10f, 0f);
        engine.lineTo(10f, 10f);
        engine.closePath();
        engine.fillPath(0); // 0 -> WIND_EVEN_ODD
        assertTrue(engine.isSawFill());
        GeneralPath path = engine.getAccumulatedPath();
        PathIterator it = path.getPathIterator(null);
        assertEquals(GeneralPath.WIND_NON_ZERO, it.getWindingRule());
    }
}
