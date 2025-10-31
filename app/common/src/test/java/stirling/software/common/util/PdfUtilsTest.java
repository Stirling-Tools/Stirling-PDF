package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.awt.image.ColorModel;
import java.awt.image.RenderedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import javax.imageio.ImageIO;

import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDPageContentStream.AppendMode;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.rendering.ImageType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.springframework.mock.web.MockMultipartFile;

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

    @Test
    void testPageCountComparators() throws Exception {
        PDDocument doc1 = new PDDocument();
        doc1.addPage(new PDPage());
        doc1.addPage(new PDPage());
        doc1.addPage(new PDPage());
        assertTrue(PdfUtils.pageCount(doc1, 2, "greater"));

        PDDocument doc2 = new PDDocument();
        doc2.addPage(new PDPage());
        doc2.addPage(new PDPage());
        doc2.addPage(new PDPage());
        assertTrue(PdfUtils.pageCount(doc2, 3, "equal"));

        PDDocument doc3 = new PDDocument();
        doc3.addPage(new PDPage());
        doc3.addPage(new PDPage());
        assertTrue(PdfUtils.pageCount(doc3, 5, "less"));

        PDDocument doc4 = new PDDocument();
        doc4.addPage(new PDPage());
        assertThrows(IllegalArgumentException.class, () -> PdfUtils.pageCount(doc4, 1, "bad"));
    }

    @Test
    void testPageSize() throws Exception {
        PDDocument doc = new PDDocument();
        PDPage page = new PDPage(PDRectangle.A4);
        doc.addPage(page);
        PDRectangle rect = page.getMediaBox();
        String expected = rect.getWidth() + "x" + rect.getHeight();
        assertTrue(PdfUtils.pageSize(doc, expected));
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
        ImageIO.write(image, "png", imgOut);

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

    // ===============================================================
    // Additional tests (added without modifying existing ones)
    // ===============================================================

    /* Helper: create a colored test image */
    private static BufferedImage createImage(int w, int h, Color color) {
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(color);
        g.fillRect(0, 0, w, h);
        g.dispose();
        return img;
    }

    /* Helper: create a factory like in existing tests */
    private static CustomPDFDocumentFactory factory() {
        PdfMetadataService meta =
                new PdfMetadataService(new ApplicationProperties(), "label", false, null);
        return new CustomPDFDocumentFactory(meta);
    }

    @Test
    @DisplayName("convertPdfToPdfImage: creates image-PDF with same page count")
    void convertPdfToPdfImage_shouldCreateImagePdfWithSamePageCount() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage p1 = new PDPage(PDRectangle.A4);
            doc.addPage(p1);
            try (PDPageContentStream cs =
                    new PDPageContentStream(doc, p1, AppendMode.APPEND, true, true)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(50, 750);
                cs.showText("Hello PDF");
                cs.endText();
            }
            PDPage p2 = new PDPage(PDRectangle.A4);
            doc.addPage(p2);

            PDDocument out = PdfUtils.convertPdfToPdfImage(doc);
            assertNotNull(out);
            assertEquals(2, out.getNumberOfPages(), "Page count should be preserved");
            out.close();
        }
    }

    @Test
    @DisplayName("imageToPdf: PNG -> single-page PDF (static ImageProcessingUtils mocked)")
    void imageToPdf_shouldCreatePdfFromPng() throws Exception {
        BufferedImage img = createImage(320, 200, Color.RED);
        ByteArrayOutputStream pngOut = new ByteArrayOutputStream();
        ImageIO.write(img, "png", pngOut);

        MockMultipartFile file =
                new MockMultipartFile("files", "test.png", "image/png", pngOut.toByteArray());

        try (MockedStatic<ImageProcessingUtils> mocked = mockStatic(ImageProcessingUtils.class)) {
            // Assume: loadImageWithExifOrientation/convertColorType exist – static mock
            mocked.when(() -> ImageProcessingUtils.loadImageWithExifOrientation(any()))
                    .thenReturn(img);
            mocked.when(
                            () ->
                                    ImageProcessingUtils.convertColorType(
                                            any(BufferedImage.class), anyString()))
                    .thenAnswer(inv -> inv.getArgument(0, BufferedImage.class));

            byte[] pdfBytes =
                    PdfUtils.imageToPdf(
                            new MockMultipartFile[] {file},
                            "maintainAspectRatio",
                            true,
                            "RGB",
                            factory());

            try (PDDocument result = factory().load(pdfBytes)) {
                assertEquals(1, result.getNumberOfPages());
            }
        }
    }

    @Test
    @DisplayName("imageToPdf: JPEG -> single-page PDF (JPEGFactory path)")
    void imageToPdf_shouldCreatePdfFromJpeg_UsingJpegFactory() throws Exception {
        BufferedImage img = createImage(640, 360, Color.BLUE);
        ByteArrayOutputStream jpgOut = new ByteArrayOutputStream();
        ImageIO.write(img, "jpg", jpgOut);

        MockMultipartFile file =
                new MockMultipartFile("files", "photo.jpg", "image/jpeg", jpgOut.toByteArray());

        try (MockedStatic<ImageProcessingUtils> mocked = mockStatic(ImageProcessingUtils.class)) {
            mocked.when(() -> ImageProcessingUtils.loadImageWithExifOrientation(any()))
                    .thenReturn(img);
            mocked.when(
                            () ->
                                    ImageProcessingUtils.convertColorType(
                                            any(BufferedImage.class), anyString()))
                    .thenAnswer(inv -> inv.getArgument(0, BufferedImage.class));

            byte[] pdfBytes =
                    PdfUtils.imageToPdf(
                            new MockMultipartFile[] {file}, "fillPage", false, "RGB", factory());

            try (PDDocument result = factory().load(pdfBytes)) {
                assertEquals(1, result.getNumberOfPages());
            }
        }
    }

    @Test
    @DisplayName("addImageToDocument: fitDocumentToImage -> page size = image size")
    void addImageToDocument_shouldUseImageSizeForPage_whenFitDocumentToImage() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            BufferedImage img = createImage(300, 500, Color.GREEN);
            PDImageXObject ximg = LosslessFactory.createFromImage(doc, img);

            PdfUtils.addImageToDocument(doc, ximg, "fitDocumentToImage", false);

            assertEquals(1, doc.getNumberOfPages());
            PDRectangle box = doc.getPage(0).getMediaBox();
            assertEquals(300, (int) box.getWidth());
            assertEquals(500, (int) box.getHeight());
        }
    }

    @Test
    @DisplayName("addImageToDocument: autoRotate rotates A4 for landscape image")
    void addImageToDocument_shouldRotateA4_whenAutoRotateAndLandscape() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            BufferedImage img = createImage(800, 400, Color.ORANGE); // Landscape
            PDImageXObject ximg = LosslessFactory.createFromImage(doc, img);

            PdfUtils.addImageToDocument(doc, ximg, "maintainAspectRatio", true);

            assertEquals(1, doc.getNumberOfPages());
            PDRectangle box = doc.getPage(0).getMediaBox();
            assertTrue(
                    box.getWidth() > box.getHeight(),
                    "A4 should be landscape when auto-rotate + landscape");
        }
    }

    @Test
    @DisplayName("addImageToDocument: fillPage runs without errors")
    void addImageToDocument_fillPage_executes() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            BufferedImage img = createImage(200, 200, Color.MAGENTA);
            PDImageXObject ximg = LosslessFactory.createFromImage(doc, img);

            PdfUtils.addImageToDocument(doc, ximg, "fillPage", false);

            assertEquals(1, doc.getNumberOfPages());
        }
    }

    @Test
    @DisplayName("overlayImage: everyPage=true overlays all pages")
    void overlayImage_shouldOverlayAllPages_whenEveryPageTrue() throws IOException {
        CustomPDFDocumentFactory factory = factory();

        // Create PDF with 2 pages
        byte[] basePdf;
        try (PDDocument doc = factory.createNewDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            doc.addPage(new PDPage(PDRectangle.A4));
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            basePdf = baos.toByteArray();
        }

        // Create image bytes
        BufferedImage img = createImage(50, 50, Color.BLACK);
        ByteArrayOutputStream pngOut = new ByteArrayOutputStream();
        ImageIO.write(img, "png", pngOut);

        byte[] result = PdfUtils.overlayImage(factory, basePdf, pngOut.toByteArray(), 10, 10, true);

        try (PDDocument out = factory.load(result)) {
            assertEquals(2, out.getNumberOfPages(), "Page count remains identical");
        }
    }

    /* Helper function: document with text on page1/page2 */
    private static PDDocument createDocWithText(String p1, String p2) throws IOException {
        PDDocument doc = new PDDocument();

        PDPage page1 = new PDPage(PDRectangle.A4);
        doc.addPage(page1);
        try (PDPageContentStream cs =
                new PDPageContentStream(doc, page1, AppendMode.APPEND, true, true)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            cs.newLineAtOffset(50, 750);
            cs.showText(p1);
            cs.endText();
        }

        PDPage page2 = new PDPage(PDRectangle.A4);
        doc.addPage(page2);
        try (PDPageContentStream cs =
                new PDPageContentStream(doc, page2, AppendMode.APPEND, true, true)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            cs.newLineAtOffset(50, 750);
            cs.showText(p2);
            cs.endText();
        }

        return doc;
    }

    @Test
    @DisplayName("containsTextInFile: pagesToCheck='all' finds text")
    void containsTextInFile_allPages_true() throws IOException {
        try (PDDocument doc = createDocWithText("alpha", "beta")) {
            assertTrue(PdfUtils.containsTextInFile(doc, "beta", "all"));
        }
    }

    @Test
    @DisplayName("containsTextInFile: single page '2' finds text")
    void containsTextInFile_singlePage_two_true() throws IOException {
        try (PDDocument doc = createDocWithText("alpha", "beta")) {
            assertTrue(PdfUtils.containsTextInFile(doc, "beta", "2"));
        }
    }

    @Test
    @DisplayName("containsTextInFile: range '1-1' finds text on page 1")
    void containsTextInFile_range_oneToOne_true() throws IOException {
        try (PDDocument doc = createDocWithText("findme", "other")) {
            assertTrue(PdfUtils.containsTextInFile(doc, "findme", "1-1"));
        }
    }

    @Test
    @DisplayName("containsTextInFile: list '1,2' finds text (whitespace robust)")
    void containsTextInFile_list_pages_true() throws IOException {
        try (PDDocument doc = createDocWithText("foo", "bar")) {
            assertTrue(PdfUtils.containsTextInFile(doc, "bar", " 1 , 2 "));
        }
    }

    @Test
    @DisplayName("containsTextInFile: text not present -> false")
    void containsTextInFile_textNotPresent_false() throws IOException {
        try (PDDocument doc = createDocWithText("xxx", "yyy")) {
            assertFalse(PdfUtils.containsTextInFile(doc, "zzz", "all"));
        }
    }

    @Test
    @DisplayName("pageSize: different size returns false")
    void pageSize_shouldReturnFalse_whenSizeDoesNotMatch() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            assertFalse(PdfUtils.pageSize(doc, "600x842"));
        }
    }

    // ===================== New: convertFromPdf – coverage =====================

    @Test
    @DisplayName("convertFromPdf: singleImage=true creates combined PNG file (readable)")
    void convertFromPdf_singleImagePng_combinedReadable() throws Exception {
        // Create two-page PDF
        byte[] pdfBytes;
        PdfMetadataService meta =
                new PdfMetadataService(new ApplicationProperties(), "label", false, null);
        CustomPDFDocumentFactory factory = new CustomPDFDocumentFactory(meta);
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            doc.addPage(new PDPage(PDRectangle.A4));
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            pdfBytes = baos.toByteArray();
        }

        byte[] imageBytes =
                PdfUtils.convertFromPdf(
                        factory, pdfBytes, "png", ImageType.RGB, true, 72, "test.pdf", false);

        // Should be readable as a single combined PNG image
        BufferedImage img = ImageIO.read(new java.io.ByteArrayInputStream(imageBytes));
        assertNotNull(img, "PNG should be readable");
        assertTrue(img.getWidth() > 0 && img.getHeight() > 0, "Image dimensions > 0");
    }

    @Test
    @DisplayName(
            "convertFromPdf: singleImage=false returns ZIP with PNG entries (first image readable)")
    void convertFromPdf_multiImagePng_firstReadable() throws Exception {
        // Create two-page PDF
        byte[] pdfBytes;
        PdfMetadataService meta =
                new PdfMetadataService(new ApplicationProperties(), "label", false, null);
        CustomPDFDocumentFactory factory = new CustomPDFDocumentFactory(meta);
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            doc.addPage(new PDPage(PDRectangle.A4));
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            pdfBytes = baos.toByteArray();
        }

        // Act: singleImage=false -> ZIP with separate images
        byte[] zipBytes =
                PdfUtils.convertFromPdf(
                        factory, pdfBytes, "png", ImageType.RGB, false, 72, "test.pdf", false);

        // Assert: open ZIP, read first entry as PNG
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ZipEntry entry = zis.getNextEntry();
            assertNotNull(entry, "ZIP should contain at least one entry");

            ByteArrayOutputStream imgOut = new ByteArrayOutputStream();
            zis.transferTo(imgOut);
            BufferedImage first = ImageIO.read(new ByteArrayInputStream(imgOut.toByteArray()));

            assertNotNull(first, "First PNG entry should be readable");
            assertTrue(first.getWidth() > 0 && first.getHeight() > 0, "Image dimensions > 0");
        }
    }

    @Test
    @DisplayName("hasText: detects phrase on selected pages ('1', '2', 'all')")
    void hasText_shouldDetectPhrase_onSelectedPages() throws Exception {
        // Arrange: PDF with 2 pages and text
        try (PDDocument doc = new PDDocument()) {
            PDPage p1 = new PDPage(PDRectangle.A4);
            PDPage p2 = new PDPage(PDRectangle.A4);
            doc.addPage(p1);
            doc.addPage(p2);

            try (PDPageContentStream cs =
                    new PDPageContentStream(doc, p1, AppendMode.APPEND, true, true)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(50, 750);
                cs.showText("alpha on page 1");
                cs.endText();
            }
            try (PDPageContentStream cs =
                    new PDPageContentStream(doc, p2, AppendMode.APPEND, true, true)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(50, 750);
                cs.showText("beta on page 2");
                cs.endText();
            }

            assertTrue(PdfUtils.hasText(doc, "1", "alpha"), "Page 1 should contain 'alpha'");
        }

        // For further checks, create new doc with identical content
        try (PDDocument doc = new PDDocument()) {
            PDPage p1 = new PDPage(PDRectangle.A4);
            PDPage p2 = new PDPage(PDRectangle.A4);
            doc.addPage(p1);
            doc.addPage(p2);

            try (PDPageContentStream cs =
                    new PDPageContentStream(doc, p1, AppendMode.APPEND, true, true)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(50, 750);
                cs.showText("alpha on page 1");
                cs.endText();
            }
            try (PDPageContentStream cs =
                    new PDPageContentStream(doc, p2, AppendMode.APPEND, true, true)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(50, 750);
                cs.showText("beta on page 2");
                cs.endText();
            }

            assertTrue(PdfUtils.hasText(doc, "2", "beta"), "Page 2 should contain 'beta'");
        }

        // Third doc for 'all'
        try (PDDocument doc = new PDDocument()) {
            PDPage p1 = new PDPage(PDRectangle.A4);
            PDPage p2 = new PDPage(PDRectangle.A4);
            doc.addPage(p1);
            doc.addPage(p2);

            try (PDPageContentStream cs =
                    new PDPageContentStream(doc, p1, AppendMode.APPEND, true, true)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(50, 750);
                cs.showText("gamma");
                cs.endText();
            }
            assertTrue(PdfUtils.hasText(doc, "all", "gamma"), "'all' should find text on page 1");
        }
    }

    @Test
    @DisplayName("hasTextOnPage: true if page contains phrase, else false")
    void hasTextOnPage_shouldReturnTrueOnlyForPagesWithPhrase() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage p1 = new PDPage(PDRectangle.A4);
            PDPage p2 = new PDPage(PDRectangle.A4);
            doc.addPage(p1);
            doc.addPage(p2);

            try (PDPageContentStream cs =
                    new PDPageContentStream(doc, p1, AppendMode.APPEND, true, true)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(50, 750);
                cs.showText("needle");
                cs.endText();
            }

            assertTrue(PdfUtils.hasTextOnPage(p1, "needle"));
            assertTrue(!PdfUtils.hasTextOnPage(p2, "needle"));
        }
    }

    @Test
    @DisplayName("hasImages: detects images on selected pages and 'all'")
    void hasImages_shouldDetectImages_onSelectedPages() throws Exception {
        // Case 1: Page 1 without image (but resources set) -> false
        try (PDDocument doc = new PDDocument()) {
            PDPage p1 = new PDPage(PDRectangle.A4);
            PDPage p2 = new PDPage(PDRectangle.A4);
            p1.setResources(new PDResources());
            p2.setResources(new PDResources());
            doc.addPage(p1);
            doc.addPage(p2);

            // Image only on page 2
            BufferedImage bi = new BufferedImage(20, 20, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = bi.createGraphics();
            g.setColor(Color.GREEN);
            g.fillRect(0, 0, 20, 20);
            g.dispose();

            PDImageXObject ximg = LosslessFactory.createFromImage(doc, bi);
            try (PDPageContentStream cs =
                    new PDPageContentStream(doc, p2, AppendMode.APPEND, true, true)) {
                cs.drawImage(ximg, 50, 700, 20, 20);
            }

            assertTrue(!PdfUtils.hasImages(doc, "1"), "Page 1 should have no image");
        }

        // Case 2: Page 2 with image -> true
        try (PDDocument doc = new PDDocument()) {
            PDPage p1 = new PDPage(PDRectangle.A4);
            PDPage p2 = new PDPage(PDRectangle.A4);
            p1.setResources(new PDResources());
            p2.setResources(new PDResources());
            doc.addPage(p1);
            doc.addPage(p2);

            BufferedImage bi = new BufferedImage(20, 20, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = bi.createGraphics();
            g.setColor(Color.BLUE);
            g.fillRect(0, 0, 20, 20);
            g.dispose();

            PDImageXObject ximg = LosslessFactory.createFromImage(doc, bi);
            try (PDPageContentStream cs =
                    new PDPageContentStream(doc, p2, AppendMode.APPEND, true, true)) {
                cs.drawImage(ximg, 50, 700, 20, 20);
            }

            assertTrue(PdfUtils.hasImages(doc, "2"), "Page 2 should have an image");
        }

        // Case 3: 'all' detects image
        try (PDDocument doc = new PDDocument()) {
            PDPage p = new PDPage(PDRectangle.A4);
            p.setResources(new PDResources());
            doc.addPage(p);

            BufferedImage bi = new BufferedImage(10, 10, BufferedImage.TYPE_INT_RGB);
            PDImageXObject ximg = LosslessFactory.createFromImage(doc, bi);
            try (PDPageContentStream cs =
                    new PDPageContentStream(doc, p, AppendMode.APPEND, true, true)) {
                cs.drawImage(ximg, 20, 730, 10, 10);
            }

            assertTrue(PdfUtils.hasImages(doc, "all"), "'all' should detect the image");
        }
    }

    @Test
    @DisplayName("hasImagesOnPage: true if page contains an image, else false")
    void hasImagesOnPage_shouldReturnTrueOnlyForPagesWithImage() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage p1 = new PDPage(PDRectangle.A4);
            PDPage p2 = new PDPage(PDRectangle.A4);
            p1.setResources(new PDResources());
            p2.setResources(new PDResources());
            doc.addPage(p1);
            doc.addPage(p2);

            BufferedImage bi = new BufferedImage(12, 12, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = bi.createGraphics();
            g.setColor(Color.RED);
            g.fillRect(0, 0, 12, 12);
            g.dispose();

            PDImageXObject ximg = LosslessFactory.createFromImage(doc, bi);
            try (PDPageContentStream cs =
                    new PDPageContentStream(doc, p1, AppendMode.APPEND, true, true)) {
                cs.drawImage(ximg, 40, 720, 12, 12);
            }

            assertTrue(PdfUtils.hasImagesOnPage(p1));
            assertTrue(!PdfUtils.hasImagesOnPage(p2));
        }
    }

    @Test
    @DisplayName("convertFromPdf: singleImage=true with JPG -> no alpha, white background")
    void convertFromPdf_singleImageJpg_noAlphaWhiteBackground() throws Exception {
        // small 1-page PDF
        byte[] pdfBytes;
        PdfMetadataService meta =
                new PdfMetadataService(new ApplicationProperties(), "label", false, null);
        CustomPDFDocumentFactory factory = new CustomPDFDocumentFactory(meta);
        try (PDDocument doc = new PDDocument()) {
            PDPage p = new PDPage(PDRectangle.A4);
            doc.addPage(p);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            pdfBytes = baos.toByteArray();
        }

        byte[] jpgBytes =
                PdfUtils.convertFromPdf(
                        factory, pdfBytes, "jpg", ImageType.RGB, true, 72, "sample.pdf", false);

        BufferedImage img = ImageIO.read(new ByteArrayInputStream(jpgBytes));
        assertNotNull(img, "JPG should be readable");

        ColorModel cm = img.getColorModel();
        assertFalse(cm.hasAlpha(), "JPG output should have no alpha channel");

        // JPG background should be white (approximate check)
        int rgb = img.getRGB(img.getWidth() / 2, img.getHeight() / 2) & 0x00FFFFFF;
        assertEquals(0xFFFFFF, rgb, "Background pixel should be white");
    }
}
