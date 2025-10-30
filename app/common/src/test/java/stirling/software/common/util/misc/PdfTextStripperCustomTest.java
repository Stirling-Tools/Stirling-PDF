package stirling.software.common.util.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class PdfTextStripperCustomTest {

    private PdfTextStripperCustom stripper;
    private PDPage mockPage;

    @BeforeEach
    void setUp() throws IOException {
        // Create the stripper instance
        stripper = new PdfTextStripperCustom();

        // Create mock objects
        mockPage = mock(PDPage.class);
        PDRectangle mockMediaBox = mock(PDRectangle.class);

        // Configure mock behavior
        when(mockPage.getMediaBox()).thenReturn(mockMediaBox);
        when(mockMediaBox.getLowerLeftX()).thenReturn(0f);
        when(mockMediaBox.getLowerLeftY()).thenReturn(0f);
        when(mockMediaBox.getWidth()).thenReturn(612f);
        when(mockMediaBox.getHeight()).thenReturn(792f);
    }

    @Test
    void testConstructor() throws IOException {
        // Verify that constructor doesn't throw an exception
        PdfTextStripperCustom newStripper = new PdfTextStripperCustom();
        assertNotNull(newStripper, "Constructor should create a non-null instance");
    }

    @Test
    void testBasicFunctionality() {
        // Simply test that the method runs without exceptions
        try {
            stripper.addRegion("testRegion", new java.awt.geom.Rectangle2D.Float(0, 0, 100, 100));
            stripper.extractRegions(mockPage);
            assertTrue(true, "Should execute without errors");
        } catch (Exception e) {
            fail("Method should not throw exception: " + e.getMessage());
        }
    }
}
