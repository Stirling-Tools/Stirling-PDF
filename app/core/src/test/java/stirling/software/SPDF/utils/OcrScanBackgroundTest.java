package stirling.software.SPDF.utils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDFormContentStream;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.documentinterchange.markedcontent.PDPropertyList;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.graphics.state.RenderingMode;
import org.junit.jupiter.api.Test;

class OcrScanBackgroundTest {

    private static final PDRectangle LETTER = PDRectangle.LETTER;
    private static final String LINE = "The invoice total was paid in full.";

    @Test
    void scanUnderInvisibleTextBecomesBackgroundArtifact() throws IOException {
        byte[] out = mark(build(Layout.TESSERACT, LETTER.getWidth(), false), 1);
        try (PDDocument doc = Loader.loadPDF(out)) {
            assertEquals(List.of("Artifact:Background"), imageMarks(doc.getPage(0)));
            assertEquals(List.of("none"), textMarks(doc.getPage(0)));
        }
    }

    @Test
    void scanUnderOcrTextLayerFormIsMarked() throws IOException {
        byte[] out = mark(build(Layout.OCRMYPDF, LETTER.getWidth(), false), 1);
        try (PDDocument doc = Loader.loadPDF(out)) {
            assertEquals(List.of("Artifact:Background"), imageMarks(doc.getPage(0)));
        }
    }

    @Test
    void pageWithoutInvisibleTextIsLeftAlone() throws IOException {
        mark(build(Layout.VISIBLE_TEXT, LETTER.getWidth(), false), 0);
    }

    @Test
    void imageCoveringPartOfThePageIsLeftAlone() throws IOException {
        mark(build(Layout.TESSERACT, LETTER.getWidth() / 2, false), 0);
    }

    @Test
    void imageAlreadyInMarkedContentIsLeftAlone() throws IOException {
        mark(build(Layout.TESSERACT, LETTER.getWidth(), true), 0);
    }

    private enum Layout {
        TESSERACT,
        OCRMYPDF,
        VISIBLE_TEXT
    }

    private static byte[] mark(byte[] pdf, int expectedPages) throws IOException {
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            assertEquals(expectedPages, OcrScanBackground.markScanBackgrounds(doc));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return out.toByteArray();
        }
    }

    private static byte[] build(Layout layout, float imageWidth, boolean imageTagged)
            throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(LETTER);
            doc.addPage(page);
            PDImageXObject scan =
                    LosslessFactory.createFromImage(
                            doc, new BufferedImage(85, 110, BufferedImage.TYPE_BYTE_GRAY));
            PDType1Font font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                if (layout == Layout.OCRMYPDF) {
                    cs.drawForm(textLayer(doc, font));
                }
                if (imageTagged) {
                    COSDictionary props = new COSDictionary();
                    props.setInt(COSName.MCID, 0);
                    cs.beginMarkedContent(
                            COSName.getPDFName("Figure"), PDPropertyList.create(props));
                }
                cs.drawImage(scan, 0, 0, imageWidth, LETTER.getHeight());
                if (imageTagged) {
                    cs.endMarkedContent();
                }
                if (layout != Layout.OCRMYPDF) {
                    writeText(cs, font, layout == Layout.TESSERACT);
                }
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return out.toByteArray();
        }
    }

    private static PDFormXObject textLayer(PDDocument doc, PDType1Font font) throws IOException {
        PDFormXObject form = new PDFormXObject(doc);
        form.setBBox(LETTER);
        form.setResources(new PDResources());
        try (PDFormContentStream cs = new PDFormContentStream(form)) {
            cs.beginText();
            cs.setFont(font, 12);
            cs.setRenderingMode(RenderingMode.NEITHER);
            cs.newLineAtOffset(72, 700);
            cs.showText(LINE);
            cs.endText();
        }
        return form;
    }

    private static void writeText(PDPageContentStream cs, PDType1Font font, boolean invisible)
            throws IOException {
        cs.beginText();
        cs.setFont(font, 12);
        if (invisible) {
            cs.setRenderingMode(RenderingMode.NEITHER);
        }
        cs.newLineAtOffset(72, 700);
        cs.showText(LINE);
        cs.endText();
    }

    private static List<String> imageMarks(PDPage page) throws IOException {
        return marksAt(page, "Do");
    }

    private static List<String> textMarks(PDPage page) throws IOException {
        return marksAt(page, "Tj");
    }

    private static List<String> marksAt(PDPage page, String target) throws IOException {
        Deque<String> open = new ArrayDeque<>();
        List<COSBase> operands = new ArrayList<>();
        List<String> found = new ArrayList<>();
        for (Object token : new PDFStreamParser(page).parse()) {
            if (!(token instanceof Operator operator)) {
                operands.add((COSBase) token);
                continue;
            }
            switch (operator.getName()) {
                case "BMC" -> open.push(((COSName) operands.get(0)).getName());
                case "BDC" -> {
                    String tag = ((COSName) operands.get(0)).getName();
                    if (operands.get(1) instanceof COSDictionary props
                            && props.getCOSName(COSName.TYPE) != null) {
                        tag += ":" + props.getCOSName(COSName.TYPE).getName();
                        assertTrue(
                                props.containsKey(COSName.BBOX), "background artifact has a BBox");
                    }
                    open.push(tag);
                }
                case "EMC" -> open.pop();
                default -> {
                    boolean isTarget = target.equals(operator.getName());
                    if (isTarget && "Do".equals(target)) {
                        isTarget =
                                page.getResources().getXObject((COSName) operands.get(0))
                                        instanceof PDImageXObject;
                    }
                    if (isTarget) {
                        found.add(open.isEmpty() ? "none" : open.peek());
                    }
                }
            }
            operands.clear();
        }
        assertTrue(open.isEmpty(), "balanced marked content");
        return found;
    }
}
