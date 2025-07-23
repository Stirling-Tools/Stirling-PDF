package stirling.software.common.util.misc;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;


import java.awt.geom.Rectangle2D;
import java.io.IOException;

import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayName("PdfTextStripperCustom Tests")
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

    @Nested
    @DisplayName("Constructor Tests")
    class ConstructorTests {

        @Test
        @DisplayName("Constructor creates instance without exceptions")
        void testConstructor() throws IOException {
            // Act
            PdfTextStripperCustom newStripper = new PdfTextStripperCustom();

            // Assert
            assertNotNull(newStripper, "Constructor should create a non-null instance");
        }
    }

    @Nested
    @DisplayName("Functionality Tests")
    class FunctionalityTests {

        @Test
        @DisplayName("addRegion and extractRegions execute without exceptions for valid input")
        void testBasicFunctionality() throws IOException {
            // Arrange
            Rectangle2D.Float region = new Rectangle2D.Float(0, 0, 100, 100);

            // Act
            try {
                stripper.addRegion("testRegion", region);
                stripper.extractRegions(mockPage);
                assertTrue(true, "Methods should execute without errors");
            } catch (Exception e) {
                fail("Methods should not throw exception: " + e.getMessage());
            }
        }

        @Test
        @DisplayName("addRegion handles null region name gracefully")
        void testAddRegionWithNullName() throws IOException {
            // Arrange
            Rectangle2D.Float region = new Rectangle2D.Float(0, 0, 100, 100);

            // Act
            try {
                stripper.addRegion(null, region);
                stripper.extractRegions(mockPage);
                assertTrue(true, "addRegion should handle null name without crashing");
            } catch (Exception e) {
                fail("addRegion with null name should not throw exception: " + e.getMessage());
            }
        }
    }
}
