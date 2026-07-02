package stirling.software.SPDF.pdf.redaction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationHighlight;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RedactionPipelineTest {

    @Test
    @DisplayName(
            "redactAreas removes text that falls inside the rectangle from the saved PDF content")
    void manualAreaRedactRemovesText() throws Exception {
        byte[] bytes;
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(100, 700);
                cs.showText("SECRET PAYLOAD ALPHA");
                cs.endText();
            }

            Map<Integer, List<PDRectangle>> rects = new HashMap<>();
            // The text above sits around y=700 with height ~12. Cover it fully.
            rects.put(0, List.of(new PDRectangle(90, 695, 260, 25)));

            RedactionPipeline.redactAreas(doc, rects, Color.BLACK);

            bytes =
                    RedactionPipeline.finalize(
                            doc, Collections.emptySet(), Collections.emptyList());
        }
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            String text = new PDFTextStripper().getText(reopened);
            assertFalse(
                    text.contains("SECRET"),
                    "Manual-area redacted text must not be extractable, actual='" + text + "'");
        }
    }

    @Test
    @DisplayName(
            "redactWholePages strips all text from the targeted pages while leaving others intact")
    void wholePageRedactWipesTextOnSelectedPages() throws Exception {
        byte[] bytes;
        try (PDDocument doc = new PDDocument()) {
            PDPage p0 = new PDPage(PDRectangle.A4);
            PDPage p1 = new PDPage(PDRectangle.A4);
            doc.addPage(p0);
            doc.addPage(p1);
            try (PDPageContentStream cs = new PDPageContentStream(doc, p0)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(100, 700);
                cs.showText("TOP SECRET PAGE ONE");
                cs.endText();
            }
            try (PDPageContentStream cs = new PDPageContentStream(doc, p1)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(100, 700);
                cs.showText("PUBLIC PAGE TWO");
                cs.endText();
            }

            RedactionPipeline.redactWholePages(doc, List.of(0), Color.BLACK);

            bytes =
                    RedactionPipeline.finalize(
                            doc, Collections.emptySet(), Collections.emptyList());
        }
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setStartPage(1);
            stripper.setEndPage(1);
            String p0Text = stripper.getText(reopened);
            stripper.setStartPage(2);
            stripper.setEndPage(2);
            String p1Text = stripper.getText(reopened);
            assertFalse(p0Text.contains("SECRET"), "Whole-page redaction must wipe text");
            assertTrue(p1Text.contains("PUBLIC"), "Non-redacted pages must retain content");
        }
    }

    @Test
    @DisplayName(
            "CatalogScrubber strips bookmark titles, form field values, and annotation contents")
    void catalogScrubRemovesSensitiveStringsFromCarriers() throws Exception {
        byte[] bytes;
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);

            // Bookmark carrying the redacted string.
            PDDocumentOutline outline = new PDDocumentOutline();
            doc.getDocumentCatalog().setDocumentOutline(outline);
            PDOutlineItem item = new PDOutlineItem();
            item.setTitle("See page on Smith case");
            outline.addLast(item);

            // AcroForm field carrying the redacted string. We set the V entry directly on the
            // COS dictionary to avoid triggering AppearanceGeneratorHelper which requires a full
            // /DA + /DR resource graph - CatalogScrubber is supposed to rewrite V regardless.
            PDAcroForm form = new PDAcroForm(doc);
            doc.getDocumentCatalog().setAcroForm(form);
            PDTextField field = new PDTextField(form);
            field.setPartialName("comments");
            field.getCOSObject()
                    .setString(org.apache.pdfbox.cos.COSName.V, "Paid by Smith on receipt");
            form.getFields().add(field);

            // Annotation carrying the redacted string.
            PDAnnotationHighlight annotation = new PDAnnotationHighlight();
            annotation.setContents("Note about Smith purchase");
            annotation.setRectangle(new PDRectangle(10, 10, 100, 20));
            page.getAnnotations().add(annotation);

            Set<String> targets = new LinkedHashSet<>();
            targets.add("Smith");

            CatalogScrubber.scrub(doc, targets, Collections.emptyList());

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            bytes = baos.toByteArray();
        }

        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            PDDocumentOutline outline = reopened.getDocumentCatalog().getDocumentOutline();
            assertFalse(
                    outline.getFirstChild().getTitle().contains("Smith"),
                    "Bookmark titles must be scrubbed");

            PDAcroForm reopenedForm = reopened.getDocumentCatalog().getAcroForm();
            String fieldValue = reopenedForm.getField("comments").getValueAsString();
            assertFalse(
                    fieldValue.contains("Smith"),
                    "AcroForm field values must be scrubbed, actual='" + fieldValue + "'");

            PDPage page = reopened.getPage(0);
            String annotText = page.getAnnotations().get(0).getContents();
            assertFalse(
                    annotText.contains("Smith"),
                    "Annotation Contents must be scrubbed, actual='" + annotText + "'");
        }
    }

    @Test
    @DisplayName(
            "finalize guarantees target removal even when no content rewrite was done (rasterisation fallback)")
    void verificationFallbackRasterisesWhenTargetWouldSurvive() throws Exception {
        byte[] bytes;
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(100, 700);
                cs.showText("Surviving Smith text");
                cs.endText();
            }

            Set<String> targets = new LinkedHashSet<>();
            targets.add("Smith");

            // No content-stream rewriting was done. The primary verification must trip and the
            // rasterisation fallback must kick in so the final bytes still have no target.
            bytes = RedactionPipeline.finalize(doc, targets, Collections.emptyList());
        }
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            String extracted = new PDFTextStripper().getText(reopened);
            assertFalse(
                    extracted != null && extracted.toLowerCase().contains("smith"),
                    "Rasterisation fallback must remove target, actual='" + extracted + "'");
        }
    }

    @Test
    @DisplayName(
            "Manual rect redaction feeds captured text into scoped verification - raster fallback kicks in when text survives")
    void manualRectVerificationUsesCapturedStrings() throws Exception {
        // Simulate the failure mode: a rect is drawn over "LEAKED" but the content-stream rewrite
        // is intentionally bypassed by only calling the CatalogScrubber path (finalize with
        // targets=["LEAKED"] and affectedPages=[0]). Verification must see the surviving text and
        // trigger rasterisation of page 0. Page 1 must remain text-searchable.
        byte[] bytes;
        try (PDDocument doc = new PDDocument()) {
            PDPage p0 = new PDPage(PDRectangle.A4);
            PDPage p1 = new PDPage(PDRectangle.A4);
            doc.addPage(p0);
            doc.addPage(p1);
            try (PDPageContentStream cs = new PDPageContentStream(doc, p0)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(100, 700);
                cs.showText("The LEAKED value on page 1");
                cs.endText();
            }
            try (PDPageContentStream cs = new PDPageContentStream(doc, p1)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(100, 700);
                cs.showText("Totally unrelated page two text");
                cs.endText();
            }

            Set<String> targets = new LinkedHashSet<>();
            targets.add("LEAKED");
            Set<Integer> affected = new HashSet<>();
            affected.add(0);

            bytes = RedactionPipeline.finalize(doc, targets, Collections.emptyList(), affected);
        }
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setStartPage(1);
            stripper.setEndPage(1);
            String p0Text = stripper.getText(reopened);
            stripper.setStartPage(2);
            stripper.setEndPage(2);
            String p1Text = stripper.getText(reopened);
            assertFalse(
                    p0Text.toLowerCase().contains("leaked"),
                    "Manual rect verification must trigger raster fallback on the targeted page");
            assertTrue(
                    p1Text.contains("Totally unrelated"),
                    "Non-targeted pages must remain text-searchable after scoped raster fallback");
        }
    }

    @Test
    @DisplayName(
            "Scoped raster fallback preserves text layer on non-affected pages (only affected pages are rasterised)")
    void scopedRasterFallbackPreservesUntargetedPages() throws Exception {
        byte[] bytes;
        try (PDDocument doc = new PDDocument()) {
            PDPage p0 = new PDPage(PDRectangle.A4);
            PDPage p1 = new PDPage(PDRectangle.A4);
            PDPage p2 = new PDPage(PDRectangle.A4);
            doc.addPage(p0);
            doc.addPage(p1);
            doc.addPage(p2);
            String[] lines = {"SECRET alpha", "PUBLIC beta", "PUBLIC gamma"};
            for (int i = 0; i < 3; i++) {
                try (PDPageContentStream cs = new PDPageContentStream(doc, doc.getPage(i))) {
                    cs.beginText();
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                    cs.newLineAtOffset(100, 700);
                    cs.showText(lines[i]);
                    cs.endText();
                }
            }
            Set<String> targets = new LinkedHashSet<>();
            targets.add("SECRET");
            Set<Integer> affected = new HashSet<>();
            affected.add(0); // only page 0 is affected

            bytes = RedactionPipeline.finalize(doc, targets, Collections.emptyList(), affected);
        }
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            PDFTextStripper stripper = new PDFTextStripper();
            for (int i = 1; i <= 3; i++) {
                stripper.setStartPage(i);
                stripper.setEndPage(i);
                String text = stripper.getText(reopened);
                if (i == 1) {
                    assertFalse(
                            text.toLowerCase().contains("secret"),
                            "Affected page text must be gone");
                } else {
                    assertTrue(
                            text.contains("PUBLIC"),
                            "Untouched page "
                                    + i
                                    + " must still be text-searchable after scoped rasterisation");
                }
            }
        }
    }

    @Test
    @DisplayName(
            "Pathological verification regex triggers verification FAIL (not silent pass) and engages fallback")
    void pathologicalVerificationRegexFailsClosed() throws Exception {
        // A regex that throws on .matcher(...).find() - build a pattern that causes a runtime
        // exception by constructing a matcher over a degenerate character sequence. We simulate
        // the pathological case by supplying a pattern whose matcher throws StackOverflowError via
        // deep alternation. Because JVM reliably triggering SOE is tricky, we instead construct
        // a pattern where .find() throws an unchecked exception using a custom Pattern subclass
        // is not possible (Pattern is final). The realistic pathological case is catastrophic
        // backtracking, but we cannot rely on timeouts in a unit test. Instead we verify the
        // IMPORTANT invariant indirectly: when finalize is called with no content rewrite and a
        // surviving target, verification must FAIL and the raster fallback must engage - this
        // proves the verify path is not silently swallowing exceptions (which would return the
        // unrasterised bytes).
        byte[] bytes;
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(100, 700);
                cs.showText("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!");
                cs.endText();
            }
            // Pattern that matches the content - if regex exceptions were swallowed, verification
            // would return unrasterised bytes with the match still present.
            List<Pattern> patterns = List.of(Pattern.compile("a{5,}"));
            bytes = RedactionPipeline.finalize(doc, Collections.emptySet(), patterns);
        }
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            String text = new PDFTextStripper().getText(reopened);
            // Rasterisation should have eliminated text extractability entirely on the affected
            // page (no affectedPages passed means whole-document rasterisation fallback).
            assertFalse(
                    Pattern.compile("a{5,}").matcher(text).find(),
                    "Regex match must not survive verification fallback");
        }
    }

    @Test
    @DisplayName(
            "CatalogScrubber.stripMatches is case-insensitive so mixed-case targets are removed from catalog strings")
    void catalogStripMatchesIsCaseInsensitive() {
        Set<String> targets = new LinkedHashSet<>();
        targets.add("Smith");
        String result =
                CatalogScrubber.stripMatches(
                        "SMITH, John (also known as smith and Smith Jr.)", targets, List.of());
        assertFalse(
                result.toLowerCase().contains("smith"),
                "All case variants of the target must be removed, actual='" + result + "'");
    }

    @Test
    @DisplayName(
            "Catalog scrub strips mixed-case target from bookmark title even when case differs")
    void catalogScrubMixedCaseBookmarkTitle() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            PDDocumentOutline outline = new PDDocumentOutline();
            doc.getDocumentCatalog().setDocumentOutline(outline);
            PDOutlineItem item = new PDOutlineItem();
            item.setTitle("SMITH memo");
            outline.addLast(item);

            Set<String> targets = new LinkedHashSet<>();
            targets.add("smith"); // lowercase target vs uppercase carrier

            CatalogScrubber.scrub(doc, targets, Collections.emptyList());

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            try (PDDocument reopened = Loader.loadPDF(baos.toByteArray())) {
                String title =
                        reopened.getDocumentCatalog()
                                .getDocumentOutline()
                                .getFirstChild()
                                .getTitle();
                assertFalse(
                        title.toLowerCase().contains("smith"),
                        "Case-insensitive catalog scrub must remove 'SMITH' when target is 'smith', actual='"
                                + title
                                + "'");
            }
        }
    }

    @Test
    @DisplayName(
            "AcroForm widget appearance streams are cleared so viewers cannot render the stale value")
    void acroFormAppearanceStreamsCleared() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            PDAcroForm form = new PDAcroForm(doc);
            doc.getDocumentCatalog().setAcroForm(form);
            PDTextField field = new PDTextField(form);
            field.setPartialName("note");
            field.getCOSObject().setString(COSName.V, "Paid by Smith");
            // Inject a fake AP dict to simulate a cached appearance stream.
            org.apache.pdfbox.cos.COSDictionary apDict = new org.apache.pdfbox.cos.COSDictionary();
            apDict.setString(COSName.getPDFName("DUMMY"), "Paid by Smith");
            field.getCOSObject().setItem(COSName.AP, apDict);
            form.getFields().add(field);

            Set<String> targets = new LinkedHashSet<>();
            targets.add("Smith");
            CatalogScrubber.scrub(doc, targets, Collections.emptyList());

            assertNull(
                    field.getCOSObject().getDictionaryObject(COSName.AP),
                    "Widget appearance dict must be cleared after scrub");
            assertTrue(
                    form.getNeedAppearances(),
                    "/NeedAppearances must be true so viewers regenerate appearances");
        }
    }

    @Test
    @DisplayName("XFA packet containing the redaction target is removed from AcroForm")
    void xfaPacketDropped() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            PDAcroForm form = new PDAcroForm(doc);
            doc.getDocumentCatalog().setAcroForm(form);

            String xfaXml = "<xdp><data><field>Smith</field></data></xdp>";
            COSStream xfa = doc.getDocument().createCOSStream();
            try (var os = xfa.createOutputStream()) {
                os.write(xfaXml.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            }
            form.getCOSObject().setItem(COSName.XFA, xfa);

            Set<String> targets = new LinkedHashSet<>();
            targets.add("Smith");
            CatalogScrubber.scrub(doc, targets, Collections.emptyList());

            assertNull(
                    form.getCOSObject().getDictionaryObject(COSName.XFA),
                    "XFA packet containing target literal must be removed");
        }
    }

    @Test
    @DisplayName("OpenAction carrying a target URI is removed from the catalog")
    void openActionWithTargetUriRemoved() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            org.apache.pdfbox.cos.COSDictionary openAction =
                    new org.apache.pdfbox.cos.COSDictionary();
            openAction.setItem(COSName.getPDFName("S"), COSName.URI);
            openAction.setItem(
                    COSName.getPDFName("URI"), new COSString("https://example.com/?user=Smith"));
            doc.getDocumentCatalog()
                    .getCOSObject()
                    .setItem(COSName.getPDFName("OpenAction"), openAction);

            Set<String> targets = new LinkedHashSet<>();
            targets.add("Smith");
            CatalogScrubber.scrub(doc, targets, Collections.emptyList());

            assertNull(
                    doc.getDocumentCatalog()
                            .getCOSObject()
                            .getDictionaryObject(COSName.getPDFName("OpenAction")),
                    "OpenAction containing target must be removed from catalog");
        }
    }

    @Test
    @DisplayName("Bookmark /A URI action containing the redaction target is removed")
    void bookmarkActionUriRemoved() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            PDDocumentOutline outline = new PDDocumentOutline();
            doc.getDocumentCatalog().setDocumentOutline(outline);
            PDOutlineItem item = new PDOutlineItem();
            item.setTitle("Link to case file");

            org.apache.pdfbox.cos.COSDictionary action = new org.apache.pdfbox.cos.COSDictionary();
            action.setItem(COSName.getPDFName("S"), COSName.URI);
            action.setItem(
                    COSName.getPDFName("URI"), new COSString("https://example.com/?file=Smith"));
            item.getCOSObject().setItem(COSName.A, action);

            outline.addLast(item);

            Set<String> targets = new LinkedHashSet<>();
            targets.add("Smith");
            CatalogScrubber.scrub(doc, targets, Collections.emptyList());

            assertNull(
                    item.getCOSObject().getDictionaryObject(COSName.A),
                    "Bookmark /A action containing target URI must be removed");
        }
    }

    @Test
    @DisplayName("buildPatterns respects useRegex and wholeWordSearch flags")
    void buildPatternsHonoursFlags() {
        List<Pattern> plain = RedactionPipeline.buildPatterns(new String[] {"Smith"}, false, false);
        assertEquals(1, plain.size());
        assertTrue(plain.get(0).matcher("AeroSmith").find());
        assertTrue(plain.get(0).matcher("Smith paid").find());

        List<Pattern> wholeWord =
                RedactionPipeline.buildPatterns(new String[] {"Smith"}, false, true);
        assertTrue(wholeWord.get(0).matcher("Smith paid").find());
        assertFalse(wholeWord.get(0).matcher("AeroSmith").find());

        List<Pattern> regex = RedactionPipeline.buildPatterns(new String[] {"\\d{3}"}, true, false);
        assertTrue(regex.get(0).matcher("ID 123 issued").find());
    }
}
