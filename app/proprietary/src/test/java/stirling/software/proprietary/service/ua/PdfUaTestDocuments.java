package stirling.software.proprietary.service.ua;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDFormContentStream;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.interactive.action.PDActionURI;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink;
import org.apache.pdfbox.util.Matrix;

/**
 * Builds the fixture corpus used by the PDF/UA tests. Fonts are embedded deliberately: the standard
 * 14 fail clause 7.21 and would mask every result.
 */
final class PdfUaTestDocuments {

    private static final String FONT_RESOURCE = "/static/fonts/DejaVuSans.ttf";
    // The font ships with core's resources, which are not on this module's classpath.
    private static final String FONT_REPO_PATH =
            "app/core/src/main/resources/static/fonts/DejaVuSans.ttf";
    private static final float MARGIN = 60f;

    private PdfUaTestDocuments() {}

    static PDFont font(PDDocument document) throws IOException {
        try (InputStream in = PdfUaTestDocuments.class.getResourceAsStream(FONT_RESOURCE)) {
            if (in != null) {
                return PDType0Font.load(document, in, true);
            }
        }
        Path repoRoot = Path.of("").toAbsolutePath();
        while (repoRoot != null && !Files.exists(repoRoot.resolve("settings.gradle"))) {
            repoRoot = repoRoot.getParent();
        }
        Path font = repoRoot == null ? null : repoRoot.resolve(FONT_REPO_PATH);
        if (font == null || !Files.exists(font)) {
            throw new IOException(
                    "Test font not found: " + FONT_RESOURCE + " or " + FONT_REPO_PATH);
        }
        try (InputStream in = Files.newInputStream(font)) {
            return PDType0Font.load(document, in, true);
        }
    }

    /** A heading followed by two paragraphs: the simplest thing that should convert cleanly. */
    static byte[] simpleDocument() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            PDFont font = font(document);
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                float y = 760;
                y = text(cs, font, 20, MARGIN, y, "Quarterly Report");
                y -= 14;
                y = text(cs, font, 11, MARGIN, y, "This document summarises the results for the");
                y = text(cs, font, 11, MARGIN, y, "period and outlines the outlook for next year.");
                y -= 14;
                text(cs, font, 11, MARGIN, y, "A second paragraph follows the first one here.");
            }
            return bytes(document);
        }
    }

    /** Three heading tiers, to exercise level assignment and the no-skipped-levels rule. */
    static byte[] headingHierarchy() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            PDFont font = font(document);
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                float y = 760;
                y = text(cs, font, 24, MARGIN, y, "Annual Review");
                y -= 12;
                y = text(cs, font, 11, MARGIN, y, "Introductory prose sits under the title here.");
                y -= 16;
                y = text(cs, font, 17, MARGIN, y, "Financial Results");
                y -= 10;
                y = text(cs, font, 11, MARGIN, y, "Revenue grew steadily across every region.");
                y -= 16;
                y = text(cs, font, 13, MARGIN, y, "Europe");
                y -= 10;
                text(cs, font, 11, MARGIN, y, "European revenue rose by eleven per cent.");
            }
            return bytes(document);
        }
    }

    /** A bulleted and a numbered list. */
    static byte[] listDocument() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            PDFont font = font(document);
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                float y = 760;
                y = text(cs, font, 18, MARGIN, y, "Checklist");
                y -= 14;
                y = text(cs, font, 11, MARGIN, y, "• Review the source document");
                y = text(cs, font, 11, MARGIN, y, "• Check every heading level");
                y = text(cs, font, 11, MARGIN, y, "• Describe each image");
                y -= 16;
                y = text(cs, font, 11, MARGIN, y, "1. Open the file");
                y = text(cs, font, 11, MARGIN, y, "2. Run the converter");
                text(cs, font, 11, MARGIN, y, "3. Validate the result");
            }
            return bytes(document);
        }
    }

    /** A three-column table whose cells each occupy their own text-showing operator. */
    static byte[] tableDocument() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            PDFont font = font(document);
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                float y = 760;
                y = text(cs, font, 18, MARGIN, y, "Regional Totals");
                y -= 20;
                String[][] rows = {
                    {"Region", "Units", "Revenue"},
                    {"North", "1200", "48000"},
                    {"South", "980", "39200"},
                    {"East", "1430", "57200"}
                };
                float[] columns = {MARGIN, MARGIN + 160, MARGIN + 300};
                for (String[] row : rows) {
                    tableRow(cs, font, 11, columns, y, row);
                    y -= 20;
                }
            }
            return bytes(document);
        }
    }

    /** A page with a real image, which must end up as a Figure needing alternative text. */
    static byte[] imageDocument() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            PDFont font = font(document);
            BufferedImage bitmap = new BufferedImage(120, 90, BufferedImage.TYPE_INT_RGB);
            java.awt.Graphics2D graphics = bitmap.createGraphics();
            graphics.setColor(Color.BLUE);
            graphics.fillRect(0, 0, 120, 90);
            graphics.dispose();
            PDImageXObject image = LosslessFactory.createFromImage(document, bitmap);

            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                float y = 760;
                y = text(cs, font, 18, MARGIN, y, "Illustrated Page");
                y -= 20;
                y = text(cs, font, 11, MARGIN, y, "The chart below shows the trend.");
                cs.drawImage(image, MARGIN, y - 120, 180, 100);
            }
            return bytes(document);
        }
    }

    /** Four pages sharing a running head and a page number, which must become artifacts. */
    static byte[] runningHeadersDocument() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDFont font = null;
            for (int i = 1; i <= 4; i++) {
                PDPage page = new PDPage(PDRectangle.A4);
                document.addPage(page);
                if (font == null) {
                    font = font(document);
                }
                try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                    text(cs, font, 9, MARGIN, 810, "Confidential Internal Report");
                    float y = 750;
                    y = text(cs, font, 16, MARGIN, y, "Section " + i);
                    y -= 12;
                    text(cs, font, 11, MARGIN, y, "Body text for section number " + i + " here.");
                    text(cs, font, 9, 300, 30, "Page " + i);
                }
            }
            return bytes(document);
        }
    }

    /** Two columns of prose, to exercise reading order. */
    static byte[] twoColumnDocument() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            PDFont font = font(document);
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                float left = MARGIN;
                float right = 320;
                float y = 740;
                for (int i = 1; i <= 8; i++) {
                    text(cs, font, 10, left, y - i * 16, "Left column line number " + i);
                    text(cs, font, 10, right, y - i * 16, "Right column line number " + i);
                }
            }
            return bytes(document);
        }
    }

    /** A page carrying a link annotation, which must be reachable from the structure tree. */
    static byte[] linkDocument() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            PDFont font = font(document);
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                float y = 760;
                y = text(cs, font, 18, MARGIN, y, "Useful Links");
                text(cs, font, 11, MARGIN, y - 20, "Visit the project home page for details.");
            }
            PDAnnotationLink link = new PDAnnotationLink();
            PDRectangle rectangle = new PDRectangle();
            rectangle.setLowerLeftX(MARGIN);
            rectangle.setLowerLeftY(725);
            rectangle.setUpperRightX(MARGIN + 200);
            rectangle.setUpperRightY(740);
            link.setRectangle(rectangle);
            PDActionURI action = new PDActionURI();
            action.setURI("https://example.org");
            link.setAction(action);
            page.getAnnotations().add(link);
            return bytes(document);
        }
    }

    /** A page with no content at all. */
    static byte[] emptyDocument() throws IOException {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage(PDRectangle.A4));
            return bytes(document);
        }
    }

    /** A page whose only content is a full-page image, standing in for an un-OCRed scan. */
    static byte[] scannedDocument() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            BufferedImage bitmap = new BufferedImage(600, 850, BufferedImage.TYPE_INT_RGB);
            java.awt.Graphics2D graphics = bitmap.createGraphics();
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, 600, 850);
            graphics.setColor(Color.BLACK);
            graphics.drawString("scanned page", 40, 60);
            graphics.dispose();
            PDImageXObject image = LosslessFactory.createFromImage(document, bitmap);
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                cs.drawImage(image, 0, 0, PDRectangle.A4.getWidth(), PDRectangle.A4.getHeight());
            }
            return bytes(document);
        }
    }

    /** Text drawn inside a form XObject, attributed to the Do operator that invoked it. */
    static byte[] formXObjectDocument() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            PDFont font = font(document);

            PDFormXObject form = new PDFormXObject(document);
            form.setBBox(new PDRectangle(220, 40));
            form.setResources(new PDResources());
            try (PDFormContentStream fcs = new PDFormContentStream(form)) {
                fcs.beginText();
                fcs.setFont(font, 11);
                fcs.newLineAtOffset(4, 14);
                fcs.showText("Text living inside the form XObject");
                fcs.endText();
            }

            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                text(cs, font, 18, MARGIN, 760, "Page With Embedded Form");
                text(cs, font, 11, MARGIN, 730, "Ordinary page text sits above the form.");
                cs.saveGraphicsState();
                cs.transform(Matrix.getTranslateInstance(MARGIN, 650));
                cs.drawForm(form);
                cs.restoreGraphicsState();
            }
            return bytes(document);
        }
    }

    /** Content split across two streams (a PDF array) - the parser must see one sequence. */
    static byte[] multiStreamDocument() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            PDFont font = font(document);
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                text(cs, font, 18, MARGIN, 760, "First Stream Heading");
            }
            try (PDPageContentStream cs =
                    new PDPageContentStream(
                            document, page, PDPageContentStream.AppendMode.APPEND, true)) {
                text(cs, font, 11, MARGIN, 720, "Second stream paragraph appended later.");
            }
            return bytes(document);
        }
    }

    /** A landscape page via /Rotate 90, which flips the frame the text engine reports in. */
    static byte[] rotatedDocument() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            page.setRotation(90);
            document.addPage(page);
            PDFont font = font(document);
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                // Drawn rotated so the text reads upright on the rotated page.
                cs.transform(Matrix.getRotateInstance(Math.toRadians(90), 595, 0));
                text(cs, font, 18, MARGIN, 500, "Rotated Page Title");
                text(cs, font, 11, MARGIN, 470, "Body text on a landscape page.");
            }
            return bytes(document);
        }
    }

    /** A MediaBox whose origin is not (0,0), which some scanners produce. */
    static byte[] offsetMediaBoxDocument() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(new PDRectangle(100, 200, 595, 842));
            document.addPage(page);
            PDFont font = font(document);
            try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
                text(cs, font, 18, 160, 960, "Offset Origin Title");
                text(cs, font, 11, 160, 930, "Text on a page whose MediaBox starts at 100,200.");
            }
            return bytes(document);
        }
    }

    // --- helpers -----------------------------------------------------------

    private static float text(
            PDPageContentStream cs, PDFont font, float size, float x, float y, String value)
            throws IOException {
        cs.beginText();
        cs.setFont(font, size);
        cs.newLineAtOffset(x, y);
        cs.showText(value);
        cs.endText();
        return y - size * 1.35f;
    }

    /**
     * Emits one row with a separate show-text operator per cell, so each cell gets its own MCID.
     */
    private static void tableRow(
            PDPageContentStream cs,
            PDFont font,
            float size,
            float[] columns,
            float y,
            String[] values)
            throws IOException {
        cs.beginText();
        cs.setFont(font, size);
        cs.newLineAtOffset(columns[0], y);
        cs.showText(values[0]);
        for (int i = 1; i < values.length; i++) {
            cs.newLineAtOffset(columns[i] - columns[i - 1], 0);
            cs.showText(values[i]);
        }
        cs.endText();
    }

    private static byte[] bytes(PDDocument document) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        document.save(out);
        return out.toByteArray();
    }
}
