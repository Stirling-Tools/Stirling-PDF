package stirling.software.SPDF.utils;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import stirling.software.SPDF.model.PdfMetadata;
import stirling.software.SPDF.utils.PdfUtils.TemplateOpcions;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.cos.COSName;

public class PdfUtilsTest {

    @Test
    void testTextToPageSize() {
        assertEquals(PDRectangle.A4, PdfUtils.textToPageSize("A4"));
        assertEquals(PDRectangle.LETTER, PdfUtils.textToPageSize("LETTER"));
        assertThrows(IllegalArgumentException.class, () -> PdfUtils.textToPageSize("INVALID"));
    }

    @Test
    void testHasImagesOnPage() throws IOException {
        // Mock a PDPage and its resources
        PDPage page = Mockito.mock(PDPage.class);
        PDResources resources = Mockito.mock(PDResources.class);
        Mockito.when(page.getResources()).thenReturn(resources);

        // Case 1: No images in resources
        Mockito.when(resources.getXObjectNames()).thenReturn(Collections.emptySet());
        assertFalse(PdfUtils.hasImagesOnPage(page));

        // Case 2: Resources with an image
        Set<COSName> xObjectNames = new HashSet<>();
        COSName cosName = Mockito.mock(COSName.class);
        xObjectNames.add(cosName);

        PDImageXObject imageXObject = Mockito.mock(PDImageXObject.class);
        Mockito.when(resources.getXObjectNames()).thenReturn(xObjectNames);
        Mockito.when(resources.getXObject(cosName)).thenReturn(imageXObject);

        assertTrue(PdfUtils.hasImagesOnPage(page));
    }

    @Test
    void testExtractMetadataFromPdf() throws IOException {
        PDDocument document = Mockito.mock(PDDocument.class);
        Mockito.when(document.getDocumentInformation()).thenReturn(Mockito.mock(org.apache.pdfbox.pdmodel.PDDocumentInformation.class));
        PdfMetadata metadata = PdfUtils.extractMetadataFromPdf(document);

        assertNotNull(metadata);
    }

    // add tests for templates 
   @Test
    public void testGetImagePositionTwoImages() {
        int pageWidth = 100;
        int pageHeight = 200;
        int slotWidth = 50;
        int slotHeight = 100;
        int offset = 5;

        // Test for image 1
        ArrayList<Integer> position1 = PdfUtils.getImagePosition(1, TemplateOpcions.TWO_IMAGES, pageWidth, pageHeight, slotWidth, slotHeight);
        assertEquals(2, position1.size());
        assertEquals(0 + offset, position1.get(0));
        assertEquals(pageHeight - slotHeight - offset, position1.get(1));

        // Test for image 2
        ArrayList<Integer> position2 = PdfUtils.getImagePosition(2, TemplateOpcions.TWO_IMAGES, pageWidth, pageHeight, slotWidth, slotHeight);
        assertEquals(2, position2.size());
        assertEquals((pageWidth / 2) + offset, position2.get(0));
        assertEquals(pageHeight - slotHeight - offset, position2.get(1));
    }

    @Test
    public void testGetImagePositionFourImages() {
        int pageWidth = 100;
        int pageHeight = 200;
        int slotWidth = 50;
        int slotHeight = 100;
        int offset = 5;

        // Test for image 1
        ArrayList<Integer> position1 = PdfUtils.getImagePosition(1, TemplateOpcions.FOUR_IMAGES, pageWidth, pageHeight, slotWidth, slotHeight);
        assertEquals(2, position1.size());
        assertEquals(0 + offset, position1.get(0));
        assertEquals(pageHeight - slotHeight - offset, position1.get(1));

        // Test for image 2
        ArrayList<Integer> position2 = PdfUtils.getImagePosition(2, TemplateOpcions.FOUR_IMAGES, pageWidth, pageHeight, slotWidth, slotHeight);
        assertEquals(2, position2.size());
        assertEquals((pageWidth / 2) + offset, position2.get(0));
        assertEquals(pageHeight - slotHeight - offset, position2.get(1));

        // Test for image 3
        ArrayList<Integer> position3 = PdfUtils.getImagePosition(3, TemplateOpcions.FOUR_IMAGES, pageWidth, pageHeight, slotWidth, slotHeight);
        assertEquals(2, position3.size());
        assertEquals(0 + offset, position3.get(0));
        assertEquals((pageHeight - 2 * slotHeight) - offset, position3.get(1));

        // Test for image 4
        ArrayList<Integer> position4 = PdfUtils.getImagePosition(4, TemplateOpcions.FOUR_IMAGES, pageWidth, pageHeight, slotWidth, slotHeight);
        assertEquals(2, position4.size());
        assertEquals((pageWidth / 2) + offset, position4.get(0));
        assertEquals((pageHeight - 2 * slotHeight) - offset, position4.get(1));
    }

    @Test
    public void testGetImagePositionSixImages() {
        int pageWidth = 150;
        int pageHeight = 200;
        int slotWidth = 50;
        int slotHeight = 100;
        int offset = 5;

        // Test for image 1
        ArrayList<Integer> position1 = PdfUtils.getImagePosition(1, TemplateOpcions.SIX_IMAGES, pageWidth, pageHeight, slotWidth, slotHeight);
        assertEquals(2, position1.size());
        assertEquals(0 + offset, position1.get(0));
        assertEquals(pageHeight - slotHeight - offset, position1.get(1));

        // Test for image 2
        ArrayList<Integer> position2 = PdfUtils.getImagePosition(2, TemplateOpcions.SIX_IMAGES, pageWidth, pageHeight, slotWidth, slotHeight);
        assertEquals(2, position2.size());
        assertEquals((pageWidth / 3) + offset, position2.get(0));
        assertEquals(pageHeight - slotHeight - offset, position2.get(1));

        // Test for image 3
        ArrayList<Integer> position3 = PdfUtils.getImagePosition(3, TemplateOpcions.SIX_IMAGES, pageWidth, pageHeight, slotWidth, slotHeight);
        assertEquals(2, position3.size());
        assertEquals((2 * pageWidth / 3) + offset, position3.get(0));
        assertEquals(pageHeight - slotHeight - offset, position3.get(1));

        // Test for image 4
        ArrayList<Integer> position4 = PdfUtils.getImagePosition(4, TemplateOpcions.SIX_IMAGES, pageWidth, pageHeight, slotWidth, slotHeight);
        assertEquals(2, position4.size());
        assertEquals(0 + offset, position4.get(0));
        assertEquals((pageHeight - 2 * slotHeight) - offset, position4.get(1));

        // Test for image 5
        ArrayList<Integer> position5 = PdfUtils.getImagePosition(5, TemplateOpcions.SIX_IMAGES, pageWidth, pageHeight, slotWidth, slotHeight);
        assertEquals(2, position5.size());
        assertEquals((pageWidth / 3) + offset, position5.get(0));
        assertEquals((pageHeight - 2 * slotHeight) - offset, position5.get(1));

        // Test for image 6
        ArrayList<Integer> position6 = PdfUtils.getImagePosition(6, TemplateOpcions.SIX_IMAGES, pageWidth, pageHeight, slotWidth, slotHeight);
        assertEquals(2, position6.size());
        assertEquals((2 * pageWidth / 3) + offset, position6.get(0));
        assertEquals((pageHeight - 2 * slotHeight) - offset, position6.get(1));
    }

    @Test
    public void testInvalidImageNumber() {
        int pageWidth = 100;
        int pageHeight = 200;
        int slotWidth = 50;
        int slotHeight = 100;

        // Test for invalid image number in TWO_IMAGES template
        Exception exception1 = assertThrows(IllegalArgumentException.class, () -> {
            PdfUtils.getImagePosition(3, TemplateOpcions.TWO_IMAGES, pageWidth, pageHeight, slotWidth, slotHeight);
        });
        assertEquals("Invalid image number for template 1x2", exception1.getMessage());

        // Test for invalid image number in FOUR_IMAGES template
        Exception exception2 = assertThrows(IllegalArgumentException.class, () -> {
            PdfUtils.getImagePosition(5, TemplateOpcions.FOUR_IMAGES, pageWidth, pageHeight, slotWidth, slotHeight);
        });
        assertEquals("Invalid image number for template 2x2", exception2.getMessage());

        // Test for invalid image number in SIX_IMAGES template
        Exception exception3 = assertThrows(IllegalArgumentException.class, () -> {
            PdfUtils.getImagePosition(7, TemplateOpcions.SIX_IMAGES, pageWidth, pageHeight, slotWidth, slotHeight);
        });
        assertEquals("Invalid image number for template 2x2", exception3.getMessage());
    }

    @Test
    public void testGetSlotWidthTwoImages() {
        int pageWidth = 100;
        int pageHeight = 200;
        int offset = 5;

        int slotWidth = PdfUtils.get_slot_width(pageWidth, pageHeight, TemplateOpcions.TWO_IMAGES);
        assertEquals((pageWidth / 2) - offset, slotWidth);
    }

    @Test
    public void testGetSlotWidthFourImages() {
        int pageWidth = 100;
        int pageHeight = 200;
        int offset = 5;

        int slotWidth = PdfUtils.get_slot_width(pageWidth, pageHeight, TemplateOpcions.FOUR_IMAGES);
        assertEquals((pageWidth / 2) - offset, slotWidth);
    }

    @Test
    public void testGetSlotWidthSixImages() {
        int pageWidth = 100;
        int pageHeight = 200;
        int offset = 5;

        int slotWidth = PdfUtils.get_slot_width(pageWidth, pageHeight, TemplateOpcions.SIX_IMAGES);
        assertEquals((pageWidth / 3) - offset, slotWidth);
    }

    @Test
    public void testGetSlotHeightTwoImages() {
        int pageWidth = 100;
        int pageHeight = 200;
        int imageWidth = 50;
        int imageHeight = 100;
        int offset = 5;

        int slotWidth = (pageWidth / 2) - offset;
        float aspectRatio = (float) imageWidth / (float) imageHeight;
        int expectedSlotHeight = (int) (slotWidth / aspectRatio);

        int slotHeight = PdfUtils.get_slot_height(pageWidth, pageHeight, imageWidth, imageHeight, TemplateOpcions.TWO_IMAGES);
        assertEquals(expectedSlotHeight, slotHeight);
    }

    @Test
    public void testGetSlotHeightFourImages() {
        int pageWidth = 100;
        int pageHeight = 200;
        int imageWidth = 50;
        int imageHeight = 100;
        int offset = 5;

        int slotWidth = (pageWidth / 2) - offset;
        float aspectRatio = (float) imageWidth / (float) imageHeight;
        int expectedSlotHeight = (int) (slotWidth / aspectRatio);

        int slotHeight = PdfUtils.get_slot_height(pageWidth, pageHeight, imageWidth, imageHeight, TemplateOpcions.FOUR_IMAGES);
        assertEquals(expectedSlotHeight, slotHeight);
    }

    @Test
    public void testGetSlotHeightSixImages() {
        int pageWidth = 100;
        int pageHeight = 200;
        int imageWidth = 50;
        int imageHeight = 100;
        int offset = 5;

        int slotWidth = (pageWidth / 3) - offset;
        float aspectRatio = (float) imageWidth / (float) imageHeight;
        int expectedSlotHeight = (int) (slotWidth / aspectRatio);

        int slotHeight = PdfUtils.get_slot_height(pageWidth, pageHeight, imageWidth, imageHeight, TemplateOpcions.SIX_IMAGES);
        assertEquals(expectedSlotHeight, slotHeight);
    }
}
