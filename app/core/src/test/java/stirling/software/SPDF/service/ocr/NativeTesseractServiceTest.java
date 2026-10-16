package stirling.software.SPDF.service.ocr;

import static org.bytedeco.leptonica.global.leptonica.pixDestroy;
import static org.bytedeco.leptonica.global.leptonica.pixGetPixel;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.PDXObject;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.bytedeco.leptonica.PIX;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;

class NativeTesseractServiceTest {

    @Test
    void emptyTessdataDisablesTheEndpointGroup(@TempDir Path emptyTessdata) {
        EndpointConfiguration endpoints = mock(EndpointConfiguration.class);
        NativeTesseractService service = service(emptyTessdata.toString(), endpoints);

        service.probe();

        assertFalse(service.isAvailable());
        verify(endpoints)
                .disableGroup(
                        NativeTesseractService.GROUP,
                        EndpointConfiguration.DisableReason.DEPENDENCY);
    }

    /**
     * Runs real recognition, so it needs this platform's natives on the classpath and
     * TESSDATA_PREFIX pointing at a folder with eng.traineddata; otherwise it is skipped.
     */
    @Nested
    class WithEnglishModel {

        private static final int DPI = 300;
        private static final float PAGE_WIDTH = 612;
        private static final float PAGE_HEIGHT = 792;
        // Where the scanned text starts, in pixels from the displayed top-left at DPI.
        private static final int WORD_X = 300;
        private static final int WORD_BASELINE = 600;
        private static final String[] PARAGRAPH = {
            "The quarterly review found that response times fell",
            "while customer satisfaction rose to ninety percent.",
            "Supplier lead times are still volatile and two depots",
            "need roof repairs before winter. The facilities team",
            "will present costed options at the November meeting.",
            "Invoices are payable within thirty days of the date.",
        };

        private String tessdata;
        private NativeTesseractService service;

        @BeforeEach
        void setUp() {
            tessdata = System.getenv("TESSDATA_PREFIX");
            assumeTrue(
                    tessdata != null && Files.exists(Path.of(tessdata, "eng.traineddata")),
                    "TESSDATA_PREFIX has no eng.traineddata");
            service = service(tessdata, mock(EndpointConfiguration.class));
            service.probe();
            assumeTrue(service.isAvailable(), "Tesseract natives not packaged for this platform");
        }

        @ParameterizedTest
        @ValueSource(ints = {0, 90, 180, 270})
        void textLayerLandsOverTheScannedWords(int rotation, @TempDir Path work) throws Exception {
            Outcome out =
                    run(scannedPage(rotation, 0, "STIRLING OCR WORKS"), OcrOptions.DEFAULT, work);
            assertTrue(out.sidecar().contains("STIRLING"), out.sidecar());

            TextPosition first = firstPositionOf(out.reload(), "STIRLING");
            float pointsPerPixel = 72f / DPI;
            assertEquals(WORD_X * pointsPerPixel, first.getX(), 8, "x of STIRLING");
            assertEquals(WORD_BASELINE * pointsPerPixel, first.getY(), 8, "y of STIRLING");
        }

        @Test
        void pagesReachLeptonicaPixelForPixel() {
            byte[] gray = new byte[12];
            gray[1] = (byte) 200;
            gray[11] = 7;
            // Second pixel is half-transparent black, so it must land on mid grey.
            byte[] rgba = {16, 32, 48, (byte) 255, 0, 0, 0, (byte) 128};

            PIX grayPix = OcrPageImages.grayPix(gray, 6, 2);
            PIX colourPix = OcrPageImages.rgbPix(rgba, 2, 1);
            try {
                assertEquals(200, pixel(grayPix, 1, 0));
                assertEquals(7, pixel(grayPix, 5, 1));
                assertEquals(0, pixel(grayPix, 4, 1));
                assertEquals(0x10203000, pixel(colourPix, 0, 0));
                assertEquals(0x7f7f7f00, pixel(colourPix, 1, 0));
                assertEquals(200, OcrPageImages.toImage(grayPix).getRaster().getSample(1, 0, 0));
                assertEquals(0x102030, OcrPageImages.toImage(colourPix).getRGB(0, 0) & 0xffffff);
            } finally {
                pixDestroy(grayPix);
                pixDestroy(colourPix);
            }
        }

        @Test
        void pagesWithTextAreSkipped(@TempDir Path work) throws Exception {
            Outcome out = run(digitalPage(), OcrOptions.DEFAULT, work);

            assertEquals("[OCR skipped on page 1]", out.sidecar());
            assertEquals(1, occurrences(text(out.reload()), "DIGITAL"));
        }

        @Test
        void forceReplacesTheTextInsteadOfDuplicatingIt(@TempDir Path work) throws Exception {
            Outcome out = run(digitalPage(), new OcrOptions(true, false, false, false), work);

            assertTrue(out.sidecar().contains("DIGITAL"), out.sidecar());
            try (PDDocument doc = out.reload()) {
                assertEquals(1, occurrences(new PDFTextStripper().getText(doc), "DIGITAL"));
                // Black text on white is stored 1-bit, as OCRmyPDF would, not as a colour JPEG.
                assertEquals(
                        COSName.CCITTFAX_DECODE,
                        images(doc.getPage(0).getResources())
                                .get(0)
                                .getCOSObject()
                                .getDictionaryObject(COSName.FILTER));
            }
        }

        @Test
        void deskewStraightensSkewedPages(@TempDir Path work) throws Exception {
            Outcome out =
                    run(
                            scannedPage(0, 6, fullPage()),
                            new OcrOptions(false, true, false, false),
                            work);

            assertTrue(wordRecall(out.sidecar()) >= 0.9, out.sidecar());
            try (PDDocument doc = out.reload()) {
                // The straightened render replaced the original scan.
                assertEquals(1, images(doc.getPage(0).getResources()).size());
                assertEquals(
                        Math.round(PAGE_WIDTH / 72 * DPI),
                        images(doc.getPage(0).getResources()).get(0).getWidth());
            }
        }

        @Test
        void rotatePagesTurnsUpsideDownPagesUpright(@TempDir Path work) throws Exception {
            assumeTrue(Files.exists(Path.of(tessdata, "osd.traineddata")), "no osd.traineddata");
            Outcome out =
                    run(
                            scannedPage(0, 180, PARAGRAPH),
                            new OcrOptions(false, false, true, false),
                            work);

            assertTrue(wordRecall(out.sidecar()) >= 0.9, out.sidecar());
            try (PDDocument doc = out.reload()) {
                assertEquals(180, doc.getPage(0).getRotation());
            }
        }

        @Test
        void removeImagesLeavesOnlyTheTextLayer(@TempDir Path work) throws Exception {
            Outcome out =
                    run(
                            scannedPage(0, 0, PARAGRAPH),
                            new OcrOptions(false, false, false, true),
                            work);

            try (PDDocument doc = out.reload()) {
                assertTrue(images(doc.getPage(0).getResources()).isEmpty());
                assertTrue(new PDFTextStripper().getText(doc).contains("quarterly"));
            }
        }

        @Test
        void parallelPagesComeBackInOrder(@TempDir Path work) throws Exception {
            String[] marks = {"ALPHA", "BRAVO", "CHARLIE", "DELTA", "ECHO"};
            PDDocument source = new PDDocument();
            // importPage shares objects with each single-page document, so they stay open until
            // the combined document is saved.
            List<PDDocument> singles = new ArrayList<>();
            Outcome out;
            try {
                for (String mark : marks) {
                    PDDocument single = scannedPage(0, 0, mark + " PAGE");
                    singles.add(single);
                    source.importPage(single.getPage(0));
                }
                out = run(source, OcrOptions.DEFAULT, work);
            } finally {
                for (PDDocument single : singles) single.close();
            }

            String[] pages = out.sidecar().split("\f");
            assertEquals(marks.length, pages.length);
            try (PDDocument doc = out.reload()) {
                PDFTextStripper stripper = new PDFTextStripper();
                for (int i = 0; i < marks.length; i++) {
                    assertTrue(pages[i].contains(marks[i]), pages[i]);
                    stripper.setStartPage(i + 1);
                    stripper.setEndPage(i + 1);
                    assertTrue(stripper.getText(doc).contains(marks[i]));
                }
            }
        }

        /** Saves {@code source}, OCRs it the way the controller does and returns the result. */
        private Outcome run(PDDocument source, OcrOptions options, Path work) throws Exception {
            Path in = work.resolve("in.pdf");
            try (source) {
                source.save(in.toFile());
            }
            try (PDDocument doc = Loader.loadPDF(in.toFile())) {
                String sidecar = service.ocrDocument(in, doc, List.of("eng"), options, DPI, work);
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                doc.save(bytes);
                return new Outcome(sidecar, bytes.toByteArray());
            }
        }

        /** Leptonica needs a page's worth of lines to trust a skew angle, as OCRmyPDF's does. */
        private String[] fullPage() {
            String[] lines = new String[PARAGRAPH.length * 4];
            for (int i = 0; i < lines.length; i++) lines[i] = PARAGRAPH[i % PARAGRAPH.length];
            return lines;
        }

        private double wordRecall(String text) {
            int found = 0, total = 0;
            for (String line : PARAGRAPH) {
                for (String word : line.split(" ")) {
                    total++;
                    if (text.contains(word)) found++;
                }
            }
            return (double) found / total;
        }

        /**
         * A letter page as displayed, scanned at DPI, with /Rotate carrying the page turn and
         * {@code skew} turning the scanned content itself.
         */
        private PDDocument scannedPage(int rotation, double skew, String... lines)
                throws IOException {
            int width = Math.round(PAGE_WIDTH / 72 * DPI);
            int height = Math.round(PAGE_HEIGHT / 72 * DPI);
            BufferedImage scan = new BufferedImage(width, height, BufferedImage.TYPE_BYTE_GRAY);
            Graphics2D g = scan.createGraphics();
            g.setRenderingHint(
                    RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
            g.setColor(Color.WHITE);
            g.fillRect(0, 0, width, height);
            g.rotate(Math.toRadians(skew), width / 2.0, height / 2.0);
            g.setColor(Color.BLACK);
            boolean single = lines.length == 1;
            g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, single ? 110 : 44));
            for (int i = 0; i < lines.length; i++) {
                g.drawString(lines[i], single ? WORD_X : 200, WORD_BASELINE + i * 70);
            }
            g.dispose();

            boolean portrait = rotation % 180 == 0;
            // An offset media box catches a mapping that ignores the box origin.
            PDRectangle media =
                    new PDRectangle(
                            40,
                            25,
                            portrait ? PAGE_WIDTH : PAGE_HEIGHT,
                            portrait ? PAGE_HEIGHT : PAGE_WIDTH);
            PDDocument document = new PDDocument();
            PDPage page = new PDPage(media);
            page.setRotation(rotation);
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.transform(OcrTextLayer.displayToUserSpace(media, rotation));
                content.drawImage(
                        LosslessFactory.createFromImage(document, scan),
                        0,
                        0,
                        PAGE_WIDTH,
                        PAGE_HEIGHT);
            }
            return document;
        }

        private PDDocument digitalPage() throws IOException {
            PDDocument document = new PDDocument();
            PDPage page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.beginText();
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD), 36);
                content.newLineAtOffset(72, 600);
                content.showText("SECRET DIGITAL TEXT");
                content.endText();
            }
            return document;
        }
    }

    private record Outcome(String sidecar, byte[] pdf) {
        PDDocument reload() throws IOException {
            return Loader.loadPDF(pdf);
        }
    }

    private static NativeTesseractService service(
            String tessdata, EndpointConfiguration endpoints) {
        RuntimePathConfig paths = mock(RuntimePathConfig.class);
        when(paths.getTessDataPath()).thenReturn(tessdata);
        return new NativeTesseractService(new ApplicationProperties(), paths, endpoints);
    }

    private static int pixel(PIX pix, int x, int y) {
        int[] value = new int[1];
        pixGetPixel(pix, x, y, value);
        return value[0];
    }

    /** Images drawn by the page, including those inside forms such as the OCR text layer. */
    private static List<PDImageXObject> images(PDResources resources) throws IOException {
        List<PDImageXObject> found = new ArrayList<>();
        if (resources == null) return found;
        for (COSName name : resources.getXObjectNames()) {
            PDXObject xobject = resources.getXObject(name);
            if (xobject instanceof PDImageXObject image) found.add(image);
            else if (xobject instanceof PDFormXObject form)
                found.addAll(images(form.getResources()));
        }
        return found;
    }

    private static String text(PDDocument document) throws IOException {
        try (document) {
            return new PDFTextStripper().getText(document);
        }
    }

    private static TextPosition firstPositionOf(PDDocument document, String word)
            throws IOException {
        List<TextPosition> positions = new ArrayList<>();
        PDFTextStripper stripper =
                new PDFTextStripper() {
                    @Override
                    protected void writeString(String text, List<TextPosition> textPositions) {
                        positions.addAll(textPositions);
                    }
                };
        try (document) {
            stripper.getText(document);
        }
        StringBuilder chars = new StringBuilder();
        positions.forEach(position -> chars.append(position.getUnicode()));
        int index = chars.indexOf(word);
        assertTrue(index >= 0, "no " + word + " in " + chars);
        return positions.get(index);
    }

    private static int occurrences(String text, String word) {
        int count = 0;
        for (int at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + 1)) count++;
        return count;
    }
}
