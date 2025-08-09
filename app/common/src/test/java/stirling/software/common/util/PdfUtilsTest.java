package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.awt.image.RenderedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageContentStream.AppendMode;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;

public class PdfUtilsTest {

    @Test
    void testTextToPageSize() {
        assertEquals(PDRectangle.A0, PdfUtils.textToPageSize("A0"));
        assertEquals(PDRectangle.A1, PdfUtils.textToPageSize("A1"));
        assertEquals(PDRectangle.A2, PdfUtils.textToPageSize("A2"));
        assertEquals(PDRectangle.A3, PdfUtils.textToPageSize("A3"));
        assertEquals(PDRectangle.A4, PdfUtils.textToPageSize("A4"));
        assertEquals(PDRectangle.A5, PdfUtils.textToPageSize("A5"));
        assertEquals(PDRectangle.A6, PdfUtils.textToPageSize("A6"));
        assertEquals(PDRectangle.LETTER, PdfUtils.textToPageSize("LETTER"));
        assertEquals(PDRectangle.LEGAL, PdfUtils.textToPageSize("LEGAL"));
        assertThrows(IllegalArgumentException.class, () -> PdfUtils.textToPageSize("INVALID"));
    }

    @Test
    void testGetAllImages() throws Exception {
        // Root resources
        PDResources root = mock(PDResources.class);

        COSName im1 = COSName.getPDFName("Im1");
        COSName form1 = COSName.getPDFName("Form1");
        COSName other1 = COSName.getPDFName("Other1");
        when(root.getXObjectNames()).thenReturn(Arrays.asList(im1, form1, other1));

        // Direct image at root
        PDImageXObject imgXObj1 = mock(PDImageXObject.class);
        BufferedImage img1 = new BufferedImage(2, 2, BufferedImage.TYPE_INT_ARGB);
        when(imgXObj1.getImage()).thenReturn(img1);
        when(root.getXObject(im1)).thenReturn(imgXObj1);

        // "Other" XObject that should be ignored
        PDXObject otherXObj = mock(PDXObject.class);
        when(root.getXObject(other1)).thenReturn(otherXObj);

        // Form XObject with its own resources
        PDFormXObject formXObj = mock(PDFormXObject.class);
        PDResources formRes = mock(PDResources.class);
        when(formXObj.getResources()).thenReturn(formRes);
        when(root.getXObject(form1)).thenReturn(formXObj);

        // Inside the form: one image and a nested form
        COSName im2 = COSName.getPDFName("Im2");
        COSName nestedForm = COSName.getPDFName("NestedForm");
        when(formRes.getXObjectNames()).thenReturn(Arrays.asList(im2, nestedForm));

        PDImageXObject imgXObj2 = mock(PDImageXObject.class);
        BufferedImage img2 = new BufferedImage(3, 3, BufferedImage.TYPE_INT_RGB);
        when(imgXObj2.getImage()).thenReturn(img2);
        when(formRes.getXObject(im2)).thenReturn(imgXObj2);

        PDFormXObject nestedFormXObj = mock(PDFormXObject.class);
        PDResources nestedRes = mock(PDResources.class);
        when(nestedFormXObj.getResources()).thenReturn(nestedRes);
        when(formRes.getXObject(nestedForm)).thenReturn(nestedFormXObj);

        // Deep nest: another image
        COSName im3 = COSName.getPDFName("Im3");
        when(nestedRes.getXObjectNames()).thenReturn(List.of(im3));

        PDImageXObject imgXObj3 = mock(PDImageXObject.class);
        BufferedImage img3 = new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB);
        when(imgXObj3.getImage()).thenReturn(img3);
        when(nestedRes.getXObject(im3)).thenReturn(imgXObj3);

        // Act
        List<RenderedImage> result = PdfUtils.getAllImages(root);

        // Assert
        assertEquals(
                3, result.size(), "It should find exactly 3 images (root + form + nested form).");
        assertTrue(
                result.containsAll(List.of(img1, img2, img3)),
                "All expected images must be present.");
    }

    // Helper method to draw a tiny image on a PDF page
    private static void drawTinyImage(PDDocument doc, PDPage page) throws IOException {
        BufferedImage bi = new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB);
        PDImageXObject ximg = LosslessFactory.createFromImage(doc, bi);
        try (PDPageContentStream cs =
                new PDPageContentStream(doc, page, AppendMode.APPEND, true, true)) {
            cs.drawImage(ximg, 10, 10, 10, 10);
        }
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
