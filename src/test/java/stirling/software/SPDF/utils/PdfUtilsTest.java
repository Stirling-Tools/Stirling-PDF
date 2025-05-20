package stirling.software.SPDF.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import stirling.software.SPDF.model.ApplicationProperties;
import stirling.software.SPDF.service.CustomPDFDocumentFactory;
import stirling.software.SPDF.service.PdfMetadataService;

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
    void testPageCountComparators() throws Exception {
        PDDocument doc1 = new PDDocument();
        doc1.addPage(new PDPage());
        doc1.addPage(new PDPage());
        doc1.addPage(new PDPage());
        PdfUtils utils = new PdfUtils();
        assertTrue(utils.pageCount(doc1, 2, "greater"));

        PDDocument doc2 = new PDDocument();
        doc2.addPage(new PDPage());
        doc2.addPage(new PDPage());
        doc2.addPage(new PDPage());
        assertTrue(utils.pageCount(doc2, 3, "equal"));

        PDDocument doc3 = new PDDocument();
        doc3.addPage(new PDPage());
        doc3.addPage(new PDPage());
        assertTrue(utils.pageCount(doc3, 5, "less"));

        PDDocument doc4 = new PDDocument();
        doc4.addPage(new PDPage());
        assertThrows(IllegalArgumentException.class, () -> utils.pageCount(doc4, 1, "bad"));
    }

    @Test
    void testPageSize() throws Exception {
        PDDocument doc = new PDDocument();
        PDPage page = new PDPage(PDRectangle.A4);
        doc.addPage(page);
        PDRectangle rect = page.getMediaBox();
        String expected = rect.getWidth() + "x" + rect.getHeight();
        PdfUtils utils = new PdfUtils();
        assertTrue(utils.pageSize(doc, expected));
    }

    @Test
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
            assertEquals(1, resultDoc.getNumberOfPages());
        }
    }
}
