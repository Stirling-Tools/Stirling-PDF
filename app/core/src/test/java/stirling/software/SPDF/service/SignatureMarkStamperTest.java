package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import javax.imageio.ImageIO;

import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.api.security.SignatureBox;
import stirling.software.SPDF.model.api.security.SignatureLogoPosition;

/**
 * Tests for {@link SignatureMarkStamper}. The mark is page content rather than a signature, so the
 * assertions read the text back off each page: that is what a reader would see, and it is the only
 * way to tell "marked" from "skipped" without trusting the return value alone.
 */
class SignatureMarkStamperTest {

    private static final SignatureBox BOX = new SignatureBox(50f, 600f, 220f, 60f);

    private static List<SignatureAppearanceLayout.Field> lines() {
        return List.of(
                new SignatureAppearanceLayout.Field("Signed by", "Samuel Saez", false),
                new SignatureAppearanceLayout.Field("Date", "2026-08-03", false));
    }

    private static PDDocument document(int pages) {
        PDDocument doc = new PDDocument();
        for (int i = 0; i < pages; i++) {
            doc.addPage(new PDPage(PDRectangle.A4));
        }
        return doc;
    }

    /** Text present on one page, which for a blank page is only what the stamper drew. */
    private static String textOnPage(PDDocument doc, int pageIndex) throws IOException {
        PDFTextStripper stripper = new PDFTextStripper();
        stripper.setStartPage(pageIndex + 1);
        stripper.setEndPage(pageIndex + 1);
        return stripper.getText(doc).trim();
    }

    @Nested
    @DisplayName("Which pages get marked")
    class PageSelection {

        @Test
        @DisplayName("Every page except the signed one is marked")
        void marksAllButSignedPage() throws IOException {
            try (PDDocument doc = document(4)) {
                int stamped = SignatureMarkStamper.stampOtherPages(doc, 1, BOX, lines());

                assertEquals(3, stamped);
                assertTrue(textOnPage(doc, 0).contains("Samuel Saez"));
                assertTrue(textOnPage(doc, 2).contains("Samuel Saez"));
                assertTrue(textOnPage(doc, 3).contains("Samuel Saez"));
            }
        }

        @Test
        @DisplayName("The signed page is left untouched, since it carries the real signature")
        void skipsSignedPage() throws IOException {
            try (PDDocument doc = document(3)) {
                SignatureMarkStamper.stampOtherPages(doc, 0, BOX, lines());

                // Drawing a copy over the actual signature would be both redundant and confusing.
                assertFalse(textOnPage(doc, 0).contains("Samuel Saez"));
                assertTrue(textOnPage(doc, 1).contains("Samuel Saez"));
            }
        }

        @Test
        @DisplayName("A single-page document gets no marks at all")
        void singlePageDocument() throws IOException {
            try (PDDocument doc = document(1)) {
                assertEquals(0, SignatureMarkStamper.stampOtherPages(doc, 0, BOX, lines()));
            }
        }
    }

    @Nested
    @DisplayName("Content of the mark")
    class Content {

        @Test
        @DisplayName("The mark shows the same fields as the signature")
        void showsSelectedFields() throws IOException {
            try (PDDocument doc = document(2)) {
                SignatureMarkStamper.stampOtherPages(doc, 0, BOX, lines());

                String text = textOnPage(doc, 1);
                assertTrue(text.contains("Signed by: Samuel Saez"), "got: " + text);
                assertTrue(text.contains("Date: 2026-08-03"), "got: " + text);
            }
        }

        @Test
        @DisplayName("Existing page content is preserved beneath the mark")
        void keepsExistingContent() throws IOException {
            try (PDDocument doc = document(2)) {
                // Give page 2 some content of its own before stamping over it.
                try (org.apache.pdfbox.pdmodel.PDPageContentStream cs =
                        new org.apache.pdfbox.pdmodel.PDPageContentStream(doc, doc.getPage(1))) {
                    cs.beginText();
                    cs.setFont(
                            new org.apache.pdfbox.pdmodel.font.PDType1Font(
                                    org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName
                                            .HELVETICA),
                            12);
                    cs.newLineAtOffset(50, 300);
                    cs.showText("Contenido original del documento");
                    cs.endText();
                }

                SignatureMarkStamper.stampOtherPages(doc, 0, BOX, lines());

                String text = textOnPage(doc, 1);
                // A mark that wiped the page it sits on would destroy the document.
                assertTrue(text.contains("Contenido original del documento"), "got: " + text);
                assertTrue(text.contains("Samuel Saez"), "got: " + text);
            }
        }
    }

    @Nested
    @DisplayName("Link back to the signature")
    class LinkToSignature {

        @Test
        @DisplayName("Each mark is clickable and jumps to the signed page")
        void marksLinkToSignedPage() throws IOException {
            try (PDDocument doc = document(3)) {
                SignatureMarkStamper.stampOtherPages(doc, 2, BOX, lines());

                for (int page : new int[] {0, 1}) {
                    var annotations = doc.getPage(page).getAnnotations();
                    assertEquals(1, annotations.size(), "page " + page + " should carry one link");

                    var link =
                            (org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationLink)
                                    annotations.get(0);
                    var action =
                            (org.apache.pdfbox.pdmodel.interactive.action.PDActionGoTo)
                                    link.getAction();
                    var destination =
                            (org.apache.pdfbox.pdmodel.interactive.documentnavigation.destination
                                            .PDPageDestination)
                                    action.getDestination();

                    // Without this a reader has no way to reach the signature's properties
                    // from the page they are looking at.
                    assertEquals(doc.getPage(2), destination.getPage());
                }
            }
        }

        @Test
        @DisplayName("The signed page gets no link, since it holds the signature itself")
        void signedPageHasNoLink() throws IOException {
            try (PDDocument doc = document(3)) {
                SignatureMarkStamper.stampOtherPages(doc, 0, BOX, lines());

                assertTrue(doc.getPage(0).getAnnotations().isEmpty());
            }
        }

        @Test
        @DisplayName("The link covers the mark exactly, so the whole box is clickable")
        void linkCoversTheMark() throws IOException {
            try (PDDocument doc = document(2)) {
                SignatureMarkStamper.stampOtherPages(doc, 0, BOX, lines());

                var link = doc.getPage(1).getAnnotations().get(0);
                PDRectangle rect = link.getRectangle();

                assertEquals(BOX.x(), rect.getLowerLeftX(), 0.01f);
                assertEquals(BOX.y(), rect.getLowerLeftY(), 0.01f);
                assertEquals(BOX.width(), rect.getWidth(), 0.01f);
                assertEquals(BOX.height(), rect.getHeight(), 0.01f);
            }
        }
    }

    @Nested
    @DisplayName("With a logo")
    class WithLogo {

        /** A red 40x20 PNG, wide enough that its strip and the text area cannot coincide. */
        private static byte[] pngBytes() throws IOException {
            BufferedImage image = new BufferedImage(40, 20, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = image.createGraphics();
            g.setColor(Color.RED);
            g.fillRect(0, 0, 40, 20);
            g.dispose();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            ImageIO.write(image, "png", out);
            return out.toByteArray();
        }

        @Test
        @DisplayName("The logo is embedded on every marked page")
        void drawsTheLogo() throws IOException {
            try (PDDocument doc = document(3)) {
                SignatureLogoPlacement.Logo logo =
                        new SignatureLogoPlacement.Logo(pngBytes(), SignatureLogoPosition.LEFT);

                int stamped = SignatureMarkStamper.stampOtherPages(doc, 0, BOX, lines(), logo);

                assertEquals(2, stamped);
                for (int page : new int[] {1, 2}) {
                    assertTrue(
                            hasImage(doc, page),
                            "page " + (page + 1) + " carries a mark but no logo");
                }
                // The signed page is left alone: its own signature already draws the logo.
                assertFalse(hasImage(doc, 0));
            }
        }

        @Test
        @DisplayName("The text still fits, and the mark still reads, once the logo takes its strip")
        void textSurvivesTheLogo() throws IOException {
            try (PDDocument doc = document(2)) {
                SignatureLogoPlacement.Logo logo =
                        new SignatureLogoPlacement.Logo(pngBytes(), SignatureLogoPosition.LEFT);

                SignatureMarkStamper.stampOtherPages(doc, 0, BOX, lines(), logo);

                assertTrue(textOnPage(doc, 1).contains("Samuel Saez"));
            }
        }

        @Test
        @DisplayName("One image object serves every page, rather than a copy per page")
        void embedsTheImageOnlyOnce() throws IOException {
            try (PDDocument doc = document(6)) {
                SignatureLogoPlacement.Logo logo =
                        new SignatureLogoPlacement.Logo(pngBytes(), SignatureLogoPosition.LEFT);

                SignatureMarkStamper.stampOtherPages(doc, 0, BOX, lines(), logo);

                // Loading the image inside the page loop would add a fresh object to the document
                // each time, so the same logo would be stored once per marked page and the file
                // would grow with the page count. Identity is what proves it is shared: equal
                // bytes drawn twice would still be two objects.
                Set<COSBase> embedded = new HashSet<>();
                for (int page = 1; page < doc.getNumberOfPages(); page++) {
                    PDResources resources = doc.getPage(page).getResources();
                    for (COSName name : resources.getXObjectNames()) {
                        if (resources.getXObject(name) instanceof PDImageXObject image) {
                            embedded.add(image.getCOSObject());
                        }
                    }
                }

                assertEquals(
                        1,
                        embedded.size(),
                        "the logo should be stored once and referenced by all 5 marked pages");
            }
        }

        @Test
        @DisplayName("Without a logo the mark is text only, as before")
        void noLogoKeepsPreviousOutput() throws IOException {
            try (PDDocument doc = document(2)) {
                SignatureMarkStamper.stampOtherPages(doc, 0, BOX, lines(), null);

                assertFalse(hasImage(doc, 1));
                assertTrue(textOnPage(doc, 1).contains("Samuel Saez"));
            }
        }

        /** Whether the page's resources hold any image, which for a blank page means the logo. */
        private static boolean hasImage(PDDocument doc, int pageIndex) throws IOException {
            PDResources resources = doc.getPage(pageIndex).getResources();
            if (resources == null) {
                return false;
            }
            for (COSName name : resources.getXObjectNames()) {
                if (resources.getXObject(name) instanceof PDImageXObject) {
                    return true;
                }
            }
            return false;
        }
    }

    @Nested
    @DisplayName("Degenerate input")
    class Degenerate {

        @Test
        @DisplayName("No box means nothing is drawn")
        void noBox() throws IOException {
            try (PDDocument doc = document(3)) {
                assertEquals(0, SignatureMarkStamper.stampOtherPages(doc, 0, null, lines()));
            }
        }

        @Test
        @DisplayName("No fields means nothing is drawn, rather than an empty framed box")
        void noLines() throws IOException {
            try (PDDocument doc = document(3)) {
                assertEquals(0, SignatureMarkStamper.stampOtherPages(doc, 0, BOX, List.of()));
                assertTrue(textOnPage(doc, 1).isEmpty());
            }
        }

        @Test
        @DisplayName("A page too small for the box is skipped rather than scribbled on")
        void pageTooSmall() throws IOException {
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage(PDRectangle.A4));
                doc.addPage(new PDPage(new PDRectangle(20f, 8f)));

                int stamped = SignatureMarkStamper.stampOtherPages(doc, 0, BOX, lines());

                assertEquals(0, stamped, "a page with no usable room must be skipped");
            }
        }
    }
}
