package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.api.security.SignatureBox;

/**
 * Tests for {@link SignatureMarkStamper}. The mark is page content rather than a signature, so the
 * assertions read the text back off each page: that is what a reader would see, and it is the only
 * way to tell "marked" from "skipped" without trusting the return value alone.
 */
class SignatureMarkStamperTest {

    private static final SignatureBox BOX = new SignatureBox(50f, 600f, 220f, 60f);

    private static Map<String, String> lines() {
        Map<String, String> lines = new LinkedHashMap<>();
        lines.put("Signed by", "Samuel Saez");
        lines.put("Date", "2026-08-03");
        return lines;
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
                assertEquals(0, SignatureMarkStamper.stampOtherPages(doc, 0, BOX, Map.of()));
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
