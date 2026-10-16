package stirling.software.SPDF.service.ocr;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.awt.geom.Point2D;

import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.util.Matrix;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class OcrTextLayerTest {

    // An offset crop box catches a mapping that ignores the box origin.
    private static final PDRectangle CROP = new PDRectangle(50, 30, 600, 800);

    /**
     * /Rotate turns the page clockwise for display, so the displayed top-left corner is the user
     * space corner that the turn brings to the top-left.
     */
    @ParameterizedTest
    @CsvSource({
        // rotation, user x and y of the displayed top-left corner, then of the displayed top-right
        "0,   50, 830, 650, 830",
        "90,  50, 30,  50,  830",
        "180, 650, 30, 50,  30",
        "270, 650, 830, 650, 30",
    })
    void displayCornersLandOnTheMatchingUserCorners(
            int rotation, float topLeftX, float topLeftY, float topRightX, float topRightY) {
        Matrix matrix = OcrTextLayer.displayToUserSpace(CROP, rotation);
        float displayWidth = rotation % 180 == 0 ? CROP.getWidth() : CROP.getHeight();
        float displayHeight = rotation % 180 == 0 ? CROP.getHeight() : CROP.getWidth();

        Point2D.Float topLeft = matrix.transformPoint(0, displayHeight);
        Point2D.Float topRight = matrix.transformPoint(displayWidth, displayHeight);

        assertEquals(topLeftX, topLeft.x, 0.01);
        assertEquals(topLeftY, topLeft.y, 0.01);
        assertEquals(topRightX, topRight.x, 0.01);
        assertEquals(topRightY, topRight.y, 0.01);
    }
}
