package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;

@DisplayName("PdfUtils Tests")
public class PdfUtilsTest {

    @Nested
    @DisplayName("Page Size Conversion Tests")
    class PageSizeConversionTests {

        @Test
        @DisplayName("Returns correct PDRectangle for supported page size strings")
        void testTextToPageSize_ValidInput() {
            assertEquals(
                    PDRectangle.A4,
                    PdfUtils.textToPageSize("A4"),
                    "Should return A4 size for 'A4' input");
            assertEquals(
                    PDRectangle.LETTER,
                    PdfUtils.textToPageSize("LETTER"),
                    "Should return LETTER size for 'LETTER' input");
        }

        @Test
        @DisplayName("Throws IllegalArgumentException for invalid page size string")
        void testTextToPageSize_InvalidInput() {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> PdfUtils.textToPageSize("INVALID"),
                    "Should throw exception for invalid page size string");
        }
    }

    @Nested
    @DisplayName("Image Detection Tests")
    class ImageDetectionTests {

        @Test
        @DisplayName("Returns false when no images are present on the PDF page")
        void testHasImagesOnPage_NoImages() throws IOException {
            // Mock a PDPage and its resources
            PDPage page = Mockito.mock(PDPage.class);
            PDResources resources = Mockito.mock(PDResources.class);
            Mockito.when(page.getResources()).thenReturn(resources);
            Mockito.when(resources.getXObjectNames()).thenReturn(Collections.emptySet());

            assertFalse(
                    PdfUtils.hasImagesOnPage(page),
                    "Should return false when no images are present");
        }

        @Test
        @DisplayName("Returns true when images are present on the PDF page")
        void testHasImagesOnPage_WithImages() throws IOException {
            // Mock a PDPage and its resources
            PDPage page = Mockito.mock(PDPage.class);
            PDResources resources = Mockito.mock(PDResources.class);
            Mockito.when(page.getResources()).thenReturn(resources);

            // Mock resources with an image
            Set<COSName> xObjectNames = new HashSet<>();
            COSName cosName = Mockito.mock(COSName.class);
            xObjectNames.add(cosName);
            PDImageXObject imageXObject = Mockito.mock(PDImageXObject.class);
            Mockito.when(resources.getXObjectNames()).thenReturn(xObjectNames);
            Mockito.when(resources.getXObject(cosName)).thenReturn(imageXObject);

            assertTrue(
                    PdfUtils.hasImagesOnPage(page), "Should return true when images are present");
        }
    }

    @Nested
    @DisplayName("Page Count Comparison Tests")
    class PageCountComparisonTests {

        @Test
        @DisplayName("Returns true when page count is greater than specified value")
        void testPageCountComparators_Greater() throws Exception {
            PDDocument doc = new PDDocument();
            doc.addPage(new PDPage());
            doc.addPage(new PDPage());
            doc.addPage(new PDPage());
            PdfUtils utils = new PdfUtils();
            assertTrue(
                    utils.pageCount(doc, 2, "greater"),
                    "Should return true for page count greater than 2");
            doc.close();
        }

        @Test
        @DisplayName("Returns true when page count is equal to specified value")
        void testPageCountComparators_Equal() throws Exception {
            PDDocument doc = new PDDocument();
            doc.addPage(new PDPage());
            doc.addPage(new PDPage());
            doc.addPage(new PDPage());
            PdfUtils utils = new PdfUtils();
            assertTrue(
                    utils.pageCount(doc, 3, "equal"),
                    "Should return true for page count equal to 3");
            doc.close();
        }

        @Test
        @DisplayName("Returns true when page count is less than specified value")
        void testPageCountComparators_Less() throws Exception {
            PDDocument doc = new PDDocument();
            doc.addPage(new PDPage());
            doc.addPage(new PDPage());
            PdfUtils utils = new PdfUtils();
            assertTrue(
                    utils.pageCount(doc, 5, "less"),
                    "Should return true for page count less than 5");
            doc.close();
        }

        @Test
        @DisplayName("Throws IllegalArgumentException for invalid comparator")
        void testPageCountComparators_InvalidComparator() throws Exception {
            PDDocument doc = new PDDocument();
            doc.addPage(new PDPage());
            PdfUtils utils = new PdfUtils();
            assertThrows(
                    IllegalArgumentException.class,
                    () -> utils.pageCount(doc, 1, "bad"),
                    "Should throw exception for invalid comparator");
            doc.close();
        }
    }

    @Nested
    @DisplayName("Page Size Matching Tests")
    class PageSizeMatchingTests {

        @Test
        @DisplayName("Returns true when PDF page size matches expected dimensions")
        void testPageSize() throws Exception {
            PDDocument doc = new PDDocument();
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            PDRectangle rect = page.getMediaBox();
            String expected = rect.getWidth() + "x" + rect.getHeight();
            PdfUtils utils = new PdfUtils();
            assertTrue(
                    utils.pageSize(doc, expected),
                    "Should return true for matching page dimensions");
            doc.close();
        }
    }

    @Nested
    @DisplayName("Image Overlay Tests")
    class ImageOverlayTests {

        @Test
        @DisplayName("Overlays image onto PDF page and preserves page count")
        void testOverlayImage() throws Exception {
            PDDocument doc = new PDDocument();
            doc.addPage(new PDPage(PDRectangle.A4));
            ByteArrayOutputStream pdfOut = new ByteArrayOutputStream();
            doc.save(pdfOut);
            doc.close();

            BufferedImage image = new BufferedImage(10, 10, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = image.createGraphics();
            g.setColor(Color.RED);
            g.fillRect(0, 0, 10, 10);
            g.dispose();
            ByteArrayOutputStream imgOut = new ByteArrayOutputStream();
            javax.imageio.ImageIO.write(image, "png", imgOut);

            PdfMetadataService meta =
                    new PdfMetadataService(new ApplicationProperties(), "label", false, null);
            CustomPDFDocumentFactory factory = new CustomPDFDocumentFactory(meta);

            byte[] result =
                    PdfUtils.overlayImage(
                            factory, pdfOut.toByteArray(), imgOut.toByteArray(), 0, 0, false);
            try (PDDocument resultDoc = factory.load(result)) {
                assertEquals(
                        1,
                        resultDoc.getNumberOfPages(),
                        "Should preserve the original page count after overlay");
            }
        }
    }
}
