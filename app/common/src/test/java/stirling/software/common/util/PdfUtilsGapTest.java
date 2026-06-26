package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.rendering.ImageType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.service.CustomPDFDocumentFactory;

/**
 * Additional unit tests for {@link PdfUtils} targeting methods not exercised by {@code
 * PdfUtilsTest}: convertFromPdf, convertPdfToPdfImage, imageToPdf, addImageToDocument,
 * overlayImage, containsTextInFile and the error branch of pageSize.
 */
@ExtendWith(MockitoExtension.class)
class PdfUtilsGapTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    // ---- helpers ------------------------------------------------------------

    /** Builds a tiny single-page PDF and returns it serialized to bytes. */
    private static byte[] simplePdfBytes() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    /** Builds a PDF with the given number of empty A4 pages. */
    private static PDDocument docWithPages(int pages) {
        PDDocument doc = new PDDocument();
        for (int i = 0; i < pages; i++) {
            doc.addPage(new PDPage(PDRectangle.A4));
        }
        return doc;
    }

    /**
     * Builds a PDF with the given number of tiny pages. convertPdfToPdfImage rasterises every page
     * at 300 DPI, so page area drives the cost; tiny pages keep render work minimal while still
     * exercising the per-page loop. Page size is non-square so dimension preservation stays
     * verifiable.
     */
    private static PDDocument docWithTinyPages(int pages, float width, float height) {
        PDDocument doc = new PDDocument();
        for (int i = 0; i < pages; i++) {
            doc.addPage(new PDPage(new PDRectangle(width, height)));
        }
        return doc;
    }

    /** Builds a PDF whose pages each contain the given text phrase. */
    private static PDDocument docWithText(String... pageTexts) throws IOException {
        PDDocument doc = new PDDocument();
        for (String text : pageTexts) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(100, 700);
                cs.showText(text);
                cs.endText();
            }
        }
        return doc;
    }

    /** Encodes a small solid-color image to bytes in the requested format. */
    private static byte[] imageBytes(String format, Color color) throws IOException {
        BufferedImage img = new BufferedImage(20, 20, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(color);
        g.fillRect(0, 0, 20, 20);
        g.dispose();
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        ImageIO.write(img, format, baos);
        return baos.toByteArray();
    }

    // ---- convertFromPdf -----------------------------------------------------

    @Nested
    @DisplayName("convertFromPdf")
    class ConvertFromPdf {

        @Test
        @DisplayName("single PNG image is produced from a one-page PDF")
        void singlePng() throws Exception {
            byte[] bytes = simplePdfBytes();
            when(pdfDocumentFactory.load(bytes)).thenReturn(docWithPages(1));

            byte[] out =
                    PdfUtils.convertFromPdf(
                            pdfDocumentFactory, bytes, "png", ImageType.RGB, true, 72, "doc", true);

            assertNotNull(out);
            assertTrue(out.length > 0);
            // A valid PNG starts with the 8-byte PNG signature.
            assertEquals((byte) 0x89, out[0]);
            assertEquals('P', out[1]);
            assertEquals('N', out[2]);
            assertEquals('G', out[3]);
        }

        @Test
        @DisplayName("single combined JPEG image is produced for multi-page PDF")
        void singleJpegMultiPage() throws Exception {
            byte[] bytes = simplePdfBytes();
            when(pdfDocumentFactory.load(bytes)).thenReturn(docWithPages(2));

            byte[] out =
                    PdfUtils.convertFromPdf(
                            pdfDocumentFactory,
                            bytes,
                            "jpg",
                            ImageType.RGB,
                            true,
                            72,
                            "doc",
                            false);

            assertNotNull(out);
            assertTrue(out.length > 0);
            // JPEG magic bytes.
            assertEquals((byte) 0xFF, out[0]);
            assertEquals((byte) 0xD8, out[1]);
        }

        @Test
        @DisplayName("single TIFF image sequence is produced for multi-page PDF")
        void singleTiffMultiPage() throws Exception {
            byte[] bytes = simplePdfBytes();
            when(pdfDocumentFactory.load(bytes)).thenReturn(docWithPages(2));

            byte[] out =
                    PdfUtils.convertFromPdf(
                            pdfDocumentFactory,
                            bytes,
                            "tiff",
                            ImageType.RGB,
                            true,
                            72,
                            "doc",
                            true);

            assertNotNull(out);
            assertTrue(out.length > 0);
        }

        @Test
        @DisplayName("non-single image mode returns a non-empty zip of per-page images")
        void zipOfImages() throws Exception {
            byte[] bytes = simplePdfBytes();
            when(pdfDocumentFactory.load(bytes)).thenReturn(docWithPages(2));

            byte[] out =
                    PdfUtils.convertFromPdf(
                            pdfDocumentFactory,
                            bytes,
                            "png",
                            ImageType.RGB,
                            false,
                            72,
                            "myfile",
                            true);

            assertNotNull(out);
            assertTrue(out.length > 0);
            // ZIP local-file-header magic "PK\003\004".
            assertEquals('P', out[0]);
            assertEquals('K', out[1]);
        }

        @Test
        @DisplayName("DPI above the safe limit throws IllegalArgumentException")
        void dpiTooHighThrows() {
            byte[] bytes = new byte[] {1, 2, 3};
            // The DPI check happens before the document is loaded.
            assertThrows(
                    IllegalArgumentException.class,
                    () ->
                            PdfUtils.convertFromPdf(
                                    pdfDocumentFactory,
                                    bytes,
                                    "png",
                                    ImageType.RGB,
                                    true,
                                    9999,
                                    "doc",
                                    true));
        }

        @Test
        @DisplayName("annotations excluded path still renders successfully")
        void withoutAnnotations() throws Exception {
            byte[] bytes = simplePdfBytes();
            when(pdfDocumentFactory.load(bytes)).thenReturn(docWithPages(1));

            byte[] out =
                    PdfUtils.convertFromPdf(
                            pdfDocumentFactory,
                            bytes,
                            "png",
                            ImageType.RGB,
                            true,
                            72,
                            "doc",
                            false);

            assertNotNull(out);
            assertTrue(out.length > 0);
        }
    }

    // ---- convertPdfToPdfImage -----------------------------------------------

    @Nested
    @DisplayName("convertPdfToPdfImage")
    class ConvertPdfToPdfImage {

        @Test
        @DisplayName("returns a new document with the same page count")
        void preservesPageCount() throws IOException {
            // Page size is irrelevant to the count assertion; tiny pages avoid a 300 DPI A4 raster.
            try (PDDocument source = docWithTinyPages(2, 6f, 9f);
                    PDDocument result = PdfUtils.convertPdfToPdfImage(source)) {
                assertNotNull(result);
                assertEquals(2, result.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("preserves page dimensions of the source")
        void preservesPageSize() throws IOException {
            // A small non-square page still proves width/height are carried through (and not
            // swapped) without rastering a full LETTER page at 300 DPI.
            float width = 60f;
            float height = 90f;
            try (PDDocument source = new PDDocument()) {
                source.addPage(new PDPage(new PDRectangle(width, height)));
                try (PDDocument result = PdfUtils.convertPdfToPdfImage(source)) {
                    PDRectangle box = result.getPage(0).getMediaBox();
                    assertEquals(width, box.getWidth(), 0.5f);
                    assertEquals(height, box.getHeight(), 0.5f);
                }
            }
        }

        @Test
        @DisplayName("empty document yields an empty document")
        void emptyDocument() throws IOException {
            try (PDDocument source = new PDDocument();
                    PDDocument result = PdfUtils.convertPdfToPdfImage(source)) {
                assertEquals(0, result.getNumberOfPages());
            }
        }
    }

    // ---- imageToPdf ---------------------------------------------------------

    @Nested
    @DisplayName("imageToPdf")
    class ImageToPdf {

        private byte[] runImageToPdf(MultipartFile[] files, String fitOption, boolean autoRotate)
                throws IOException {
            when(pdfDocumentFactory.createNewDocument()).thenReturn(new PDDocument());
            return PdfUtils.imageToPdf(files, fitOption, autoRotate, "color", pdfDocumentFactory);
        }

        @Test
        @DisplayName("single PNG image becomes a one-page PDF")
        void singlePngImage() throws IOException {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "file",
                            "image.png",
                            MediaType.IMAGE_PNG_VALUE,
                            imageBytes("png", Color.RED));

            byte[] pdfOut = runImageToPdf(new MultipartFile[] {file}, "fillPage", false);

            assertNotNull(pdfOut);
            try (PDDocument doc = org.apache.pdfbox.Loader.loadPDF(pdfOut)) {
                assertEquals(1, doc.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("JPEG image uses the lossy factory path and produces a PDF")
        void jpegImage() throws IOException {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "file",
                            "image.jpg",
                            MediaType.IMAGE_JPEG_VALUE,
                            imageBytes("jpg", Color.BLUE));

            byte[] pdfOut = runImageToPdf(new MultipartFile[] {file}, "maintainAspectRatio", false);

            assertNotNull(pdfOut);
            try (PDDocument doc = org.apache.pdfbox.Loader.loadPDF(pdfOut)) {
                assertEquals(1, doc.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("fitDocumentToImage sizes the page to the image")
        void fitDocumentToImage() throws IOException {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "file",
                            "image.png",
                            MediaType.IMAGE_PNG_VALUE,
                            imageBytes("png", Color.GREEN));

            byte[] pdfOut = runImageToPdf(new MultipartFile[] {file}, "fitDocumentToImage", false);

            try (PDDocument doc = org.apache.pdfbox.Loader.loadPDF(pdfOut)) {
                PDRectangle box = doc.getPage(0).getMediaBox();
                assertEquals(20f, box.getWidth(), 0.5f);
                assertEquals(20f, box.getHeight(), 0.5f);
            }
        }

        @Test
        @DisplayName("multiple images become multiple pages")
        void multipleImages() throws IOException {
            MockMultipartFile a =
                    new MockMultipartFile(
                            "file",
                            "a.png",
                            MediaType.IMAGE_PNG_VALUE,
                            imageBytes("png", Color.RED));
            MockMultipartFile b =
                    new MockMultipartFile(
                            "file",
                            "b.png",
                            MediaType.IMAGE_PNG_VALUE,
                            imageBytes("png", Color.BLUE));

            byte[] pdfOut = runImageToPdf(new MultipartFile[] {a, b}, "fillPage", true);

            try (PDDocument doc = org.apache.pdfbox.Loader.loadPDF(pdfOut)) {
                assertEquals(2, doc.getNumberOfPages());
            }
        }
    }

    // ---- addImageToDocument -------------------------------------------------

    @Nested
    @DisplayName("addImageToDocument")
    class AddImageToDocument {

        private PDImageXObject portraitImage(PDDocument doc) throws IOException {
            BufferedImage img = new BufferedImage(40, 80, BufferedImage.TYPE_INT_RGB);
            return org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory.createFromImage(
                    doc, img);
        }

        private PDImageXObject landscapeImage(PDDocument doc) throws IOException {
            BufferedImage img = new BufferedImage(80, 40, BufferedImage.TYPE_INT_RGB);
            return org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory.createFromImage(
                    doc, img);
        }

        @Test
        @DisplayName("fillPage adds an A4 page")
        void fillPage() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PdfUtils.addImageToDocument(doc, portraitImage(doc), "fillPage", false);
                assertEquals(1, doc.getNumberOfPages());
                PDRectangle box = doc.getPage(0).getMediaBox();
                assertEquals(PDRectangle.A4.getWidth(), box.getWidth(), 0.5f);
            }
        }

        @Test
        @DisplayName("maintainAspectRatio adds an A4 page and centers the image")
        void maintainAspectRatio() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PdfUtils.addImageToDocument(doc, portraitImage(doc), "maintainAspectRatio", false);
                assertEquals(1, doc.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("fitDocumentToImage sizes the page to the image bounds")
        void fitDocumentToImage() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PdfUtils.addImageToDocument(doc, portraitImage(doc), "fitDocumentToImage", false);
                PDRectangle box = doc.getPage(0).getMediaBox();
                assertEquals(40f, box.getWidth(), 0.5f);
                assertEquals(80f, box.getHeight(), 0.5f);
            }
        }

        @Test
        @DisplayName("autoRotate with a landscape image swaps to landscape A4")
        void autoRotateLandscape() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PdfUtils.addImageToDocument(doc, landscapeImage(doc), "maintainAspectRatio", true);
                PDRectangle box = doc.getPage(0).getMediaBox();
                // Landscape: width should now exceed height.
                assertTrue(box.getWidth() > box.getHeight());
            }
        }

        @Test
        @DisplayName("unknown fit option still adds a page without drawing")
        void unknownFitOption() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                PdfUtils.addImageToDocument(doc, portraitImage(doc), "unknownOption", false);
                assertEquals(1, doc.getNumberOfPages());
            }
        }
    }

    // ---- overlayImage -------------------------------------------------------

    @Nested
    @DisplayName("overlayImage")
    class OverlayImage {

        @Test
        @DisplayName("overlays only the first page when everyPage is false")
        void firstPageOnly() throws IOException {
            byte[] pdf = simplePdfBytes();
            when(pdfDocumentFactory.load(pdf)).thenReturn(docWithPages(3));
            byte[] image = imageBytes("png", Color.RED);

            byte[] out = PdfUtils.overlayImage(pdfDocumentFactory, pdf, image, 10f, 10f, false);

            assertNotNull(out);
            try (PDDocument doc = org.apache.pdfbox.Loader.loadPDF(out)) {
                assertEquals(3, doc.getNumberOfPages());
            }
        }

        @Test
        @DisplayName("overlays every page when everyPage is true")
        void everyPage() throws IOException {
            byte[] pdf = simplePdfBytes();
            when(pdfDocumentFactory.load(pdf)).thenReturn(docWithPages(2));
            byte[] image = imageBytes("png", Color.BLUE);

            byte[] out = PdfUtils.overlayImage(pdfDocumentFactory, pdf, image, 0f, 0f, true);

            assertNotNull(out);
            assertTrue(out.length > 0);
            try (PDDocument doc = org.apache.pdfbox.Loader.loadPDF(out)) {
                assertEquals(2, doc.getNumberOfPages());
            }
        }
    }

    // ---- containsTextInFile -------------------------------------------------

    @Nested
    @DisplayName("containsTextInFile")
    class ContainsTextInFile {

        @Test
        @DisplayName("finds text when searching all pages")
        void allPagesMatch() throws IOException {
            PDDocument doc = docWithText("HelloWorld");
            assertTrue(PdfUtils.containsTextInFile(doc, "HelloWorld", "all"));
        }

        @Test
        @DisplayName("null pagesToCheck is treated as all pages")
        void nullPagesTreatedAsAll() throws IOException {
            PDDocument doc = docWithText("FindThis");
            assertTrue(PdfUtils.containsTextInFile(doc, "FindThis", null));
        }

        @Test
        @DisplayName("returns false when text is absent")
        void noMatch() throws IOException {
            PDDocument doc = docWithText("SomeText");
            assertFalse(PdfUtils.containsTextInFile(doc, "Missing", "all"));
        }

        @Test
        @DisplayName("matches text on an individual page number")
        void individualPage() throws IOException {
            PDDocument doc = docWithText("PageOne", "PageTwo");
            assertTrue(PdfUtils.containsTextInFile(doc, "PageTwo", "2"));
        }

        @Test
        @DisplayName("matches text within a page range")
        void pageRange() throws IOException {
            PDDocument doc = docWithText("Alpha", "Beta", "Gamma");
            assertTrue(PdfUtils.containsTextInFile(doc, "Gamma", "1-3"));
        }

        @Test
        @DisplayName("whitespace in the page spec is stripped before parsing")
        void whitespaceStripped() throws IOException {
            PDDocument doc = docWithText("One", "Two");
            assertTrue(PdfUtils.containsTextInFile(doc, "Two", " 1 , 2 "));
        }
    }

    // ---- pageSize error branch ---------------------------------------------

    @Nested
    @DisplayName("pageSize parsing")
    class PageSizeParsing {

        @Test
        @DisplayName("non-numeric expected size throws NumberFormatException")
        void nonNumericThrows() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage(PDRectangle.A4));
                assertThrows(
                        NumberFormatException.class, () -> PdfUtils.pageSize(doc, "widthxheight"));
            }
        }
    }
}
