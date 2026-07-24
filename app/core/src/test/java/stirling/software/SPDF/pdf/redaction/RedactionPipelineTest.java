package stirling.software.SPDF.pdf.redaction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.common.PDStream;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDTrueTypeFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.font.encoding.WinAnsiEncoding;
import org.apache.pdfbox.pdmodel.graphics.form.PDFormXObject;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
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
            // The text above sits around y=700 with height ~12.
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

            // AcroForm field carrying the redacted string.
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

            // No content-stream rewriting was done.
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
        // Simulate the failure mode: a rect is drawn over "LEAKED"
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
        // A regex that throws on .matcher(...).find() - build a pattern that causes
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
            // Pattern that matches the content - if regex exceptions were swallowed
            List<Pattern> patterns = List.of(Pattern.compile("a{5,}"));
            bytes = RedactionPipeline.finalize(doc, Collections.emptySet(), patterns);
        }
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            String text = new PDFTextStripper().getText(reopened);
            // Rasterisation should have eliminated text extractability entirely
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

    @Test
    @DisplayName(
            "whole-word single-char non-word target (&) matches; finder and pipeline agree (F2)")
    void wholeWordSingleCharNonWordTarget() {
        List<Pattern> pipeline = RedactionPipeline.buildPatterns(new String[] {"&"}, false, true);
        assertEquals(1, pipeline.size());
        assertTrue(
                pipeline.get(0).matcher("a & b").find(),
                "\\b&\\b no-ops on '&'; the shared lookaround wrapper must match");
        List<Pattern> finder =
                stirling.software.SPDF.utils.text.TextFinderUtils.createOptimizedSearchPatterns(
                        Set.of("&"), false, true);
        assertTrue(finder.get(0).matcher("a & b").find(), "finder and pipeline must agree");
    }

    @Test
    @DisplayName("form XObject text is physically removed, not left for rasterisation (F3)")
    void formXObjectTextPhysicallyRemoved() throws Exception {
        byte[] bytes;
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            PDFormXObject form = new PDFormXObject(doc);
            form.setResources(new PDResources());
            form.getResources()
                    .put(
                            COSName.getPDFName("F1"),
                            new PDType1Font(Standard14Fonts.FontName.HELVETICA));
            form.setBBox(new PDRectangle(0, 0, 300, 50));
            try (var out = form.getStream().createOutputStream()) {
                out.write(
                        "BT /F1 12 Tf 0 10 Td (SECRET payload) Tj ET"
                                .getBytes(StandardCharsets.ISO_8859_1));
            }
            PDResources pageRes = new PDResources();
            COSName fn = pageRes.add(form);
            page.setResources(pageRes);
            PDStream ps = new PDStream(doc);
            try (var out = ps.createOutputStream()) {
                out.write(
                        ("q 1 0 0 1 100 700 cm /" + fn.getName() + " Do Q")
                                .getBytes(StandardCharsets.ISO_8859_1));
            }
            page.setContents(ps);

            Set<String> targets = new LinkedHashSet<>(Set.of("SECRET"));
            List<Pattern> pats =
                    RedactionPipeline.buildPatterns(new String[] {"SECRET"}, false, false);
            RedactionPipeline.redactLiteralTerms(doc, targets, pats);
            bytes = RedactionPipeline.finalize(doc, targets, pats);
        }
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            assertFalse(
                    new PDFTextStripper().getText(reopened).contains("SECRET"),
                    "form XObject text must not be extractable");
            assertFalse(
                    pageHasImage(reopened.getPage(0)),
                    "removal should be surgical (form rewritten), not full rasterisation");
        }
    }

    @Test
    @DisplayName(
            "verify() sees glyphs masked by /ActualText and rasterises the survivor (discovery)")
    void actualTextMaskedSurvivorIsCaught() throws Exception {
        byte[] bytes;
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            PDResources res = new PDResources();
            COSName f = res.add(new PDType1Font(Standard14Fonts.FontName.HELVETICA));
            page.setResources(res);
            // Real glyphs paint SECRET but /ActualText claims the run is SAFE.
            String content =
                    "/Span <</ActualText (SAFE)>> BDC BT /"
                            + f.getName()
                            + " 12 Tf 100 700 Td (SECRET) Tj ET EMC";
            PDStream ps = new PDStream(doc);
            try (var out = ps.createOutputStream()) {
                out.write(content.getBytes(StandardCharsets.ISO_8859_1));
            }
            page.setContents(ps);

            // No removal pass: rely on finalize's verify to catch the masked survivor.
            bytes =
                    RedactionPipeline.finalize(
                            doc, new LinkedHashSet<>(Set.of("SECRET")), List.of());
        }
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            // A default stripper would read 'SAFE' and pass.
            assertTrue(
                    pageHasImage(reopened.getPage(0)),
                    "ActualText-masked survivor must be detected and rasterised");
            assertFalse(new PDFTextStripper().getText(reopened).contains("SECRET"));
        }
    }

    @Test
    @DisplayName("scrub keeps /AP on form fields that do not contain the target (F7a)")
    void untouchedFormFieldKeepsAppearance() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            PDAcroForm form = new PDAcroForm(doc);
            doc.getDocumentCatalog().setAcroForm(form);

            PDTextField hit = new PDTextField(form);
            hit.setPartialName("hit");
            hit.getCOSObject().setString(COSName.V, "paid by Smith");
            hit.getCOSObject().setItem(COSName.AP, new COSDictionary());
            form.getFields().add(hit);

            PDTextField clean = new PDTextField(form);
            clean.setPartialName("clean");
            clean.getCOSObject().setString(COSName.V, "nothing sensitive");
            clean.getCOSObject().setItem(COSName.AP, new COSDictionary());
            form.getFields().add(clean);

            CatalogScrubber.scrub(
                    doc, new LinkedHashSet<>(Set.of("Smith")), Collections.emptyList());

            assertNull(
                    hit.getCOSObject().getDictionaryObject(COSName.AP),
                    "matched field /AP should be dropped for regeneration");
            assertNotNull(
                    clean.getCOSObject().getDictionaryObject(COSName.AP),
                    "untouched field must keep its /AP (F7a)");
        }
    }

    private static final String LIBERATION =
            "/org/apache/pdfbox/resources/ttf/LiberationSans-Regular.ttf";

    @Test
    @DisplayName("verify gate skips the native pass when all fonts are Standard-14")
    void gateSkipsForStandard14() throws Exception {
        byte[] bytes;
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(72, 700);
                cs.showText("plain Helvetica text");
                cs.endText();
            }
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            doc.save(b);
            bytes = b.toByteArray();
        }
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            assertFalse(
                    RedactionPipeline.documentHasUnreliableFont(reopened),
                    "Standard-14 fonts extract reliably in PDFBox; native pass is redundant");
        }
    }

    @Test
    @DisplayName("verify gate runs the native pass for an embedded font without /ToUnicode")
    void gateRunsForNonStandardFontWithoutToUnicode() throws Exception {
        byte[] bytes;
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            PDFont font;
            try (var ttf = PDDocument.class.getResourceAsStream(LIBERATION)) {
                font = PDTrueTypeFont.load(doc, ttf, WinAnsiEncoding.INSTANCE);
            }
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(font, 12);
                cs.newLineAtOffset(72, 700);
                cs.showText("embedded TrueType no ToUnicode");
                cs.endText();
            }
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            doc.save(b);
            bytes = b.toByteArray();
        }
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            assertFalse(
                    reopened.getPage(0)
                            .getResources()
                            .getFontNames()
                            .iterator()
                            .next()
                            .getName()
                            .isEmpty());
            assertTrue(
                    RedactionPipeline.documentHasUnreliableFont(reopened),
                    "embedded non-Standard-14 font without /ToUnicode needs the native pass");
        }
    }

    @Test
    @DisplayName("verify gate skips the native pass when a Type0 font carries /ToUnicode")
    void gateSkipsForType0WithToUnicode() throws Exception {
        byte[] bytes;
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            PDFont font;
            try (var ttf = PDDocument.class.getResourceAsStream(LIBERATION)) {
                font = PDType0Font.load(doc, ttf, false);
            }
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(font, 12);
                cs.newLineAtOffset(72, 700);
                cs.showText("full Type0 with ToUnicode");
                cs.endText();
            }
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            doc.save(b);
            bytes = b.toByteArray();
        }
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            assertFalse(
                    RedactionPipeline.documentHasUnreliableFont(reopened),
                    "a /ToUnicode map makes PDFBox extraction authoritative; native pass redundant");
        }
    }

    @Test
    @DisplayName("verify gate recurses into form XObjects to find an unreliable font")
    void gateDetectsUnreliableFontInsideXObject() throws Exception {
        byte[] bytes;
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            // Page-level font is reliable (Standard-14); the risky font hides in a form XObject.
            PDResources pageRes = new PDResources();
            pageRes.put(
                    COSName.getPDFName("PF"), new PDType1Font(Standard14Fonts.FontName.HELVETICA));

            PDFormXObject form = new PDFormXObject(doc);
            PDResources formRes = new PDResources();
            PDFont embedded;
            try (var ttf = PDDocument.class.getResourceAsStream(LIBERATION)) {
                embedded = PDTrueTypeFont.load(doc, ttf, WinAnsiEncoding.INSTANCE);
            }
            formRes.put(COSName.getPDFName("F1"), embedded);
            form.setResources(formRes);
            form.setBBox(new PDRectangle(0, 0, 200, 50));
            try (var out = form.getStream().createOutputStream()) {
                out.write(
                        "BT /F1 12 Tf 0 10 Td (hidden) Tj ET"
                                .getBytes(StandardCharsets.ISO_8859_1));
            }
            COSName formName = pageRes.add(form);
            page.setResources(pageRes);
            PDStream ps = new PDStream(doc);
            try (var out = ps.createOutputStream()) {
                out.write(
                        ("q 1 0 0 1 50 700 cm /" + formName.getName() + " Do Q")
                                .getBytes(StandardCharsets.ISO_8859_1));
            }
            page.setContents(ps);
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            doc.save(b);
            bytes = b.toByteArray();
        }
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            assertTrue(
                    RedactionPipeline.documentHasUnreliableFont(reopened),
                    "an unreliable font inside a form XObject must be detected by recursion");
        }
    }

    @Test
    @DisplayName("finalizeAreas scrubs catalog carriers of the captured in-rect text (must-fix-1)")
    void finalizeAreasScrubsCarriers() throws Exception {
        byte[] out;
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(72, 700);
                cs.showText("Paid by Smith");
                cs.endText();
            }
            PDDocumentOutline outline = new PDDocumentOutline();
            doc.getDocumentCatalog().setDocumentOutline(outline);
            PDOutlineItem item = new PDOutlineItem();
            item.setTitle("Smith case notes");
            outline.addLast(item);

            Map<Integer, List<PDRectangle>> rects = new HashMap<>();
            rects.put(0, List.of(new PDRectangle(72, 695, 120, 15)));
            out =
                    RedactionPipeline.finalizeAreas(
                            doc, rects, new HashSet<>(), new LinkedHashSet<>(Set.of("Smith")));
        }
        try (PDDocument reopened = Loader.loadPDF(out)) {
            PDDocumentOutline outline = reopened.getDocumentCatalog().getDocumentOutline();
            assertFalse(
                    outline.getFirstChild().getTitle().contains("Smith"),
                    "manual-area finalize must scrub the bookmark carrier (must-fix-1)");
        }
    }

    @Test
    @DisplayName(
            "verify fails closed and rasterises when a required native pass can't run (must-fix-3)")
    void failsClosedWhenNativeUnavailableForUnreliableFont() throws Exception {
        RedactionPipeline.setJpdfiumAvailableForTest(false);
        try {
            byte[] out;
            try (PDDocument doc = new PDDocument()) {
                PDPage page = new PDPage(PDRectangle.A4);
                doc.addPage(page);
                PDFont font;
                try (var ttf = PDDocument.class.getResourceAsStream(LIBERATION)) {
                    // embedded TrueType, no /ToUnicode -> PDFBox-unreliable -> native pass required
                    font = PDTrueTypeFont.load(doc, ttf, WinAnsiEncoding.INSTANCE);
                }
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.beginText();
                    cs.setFont(font, 12);
                    cs.newLineAtOffset(72, 700);
                    cs.showText("keep me");
                    cs.endText();
                }
                out =
                        RedactionPipeline.finalize(
                                doc, new LinkedHashSet<>(Set.of("SECRET")), List.of());
            }
            try (PDDocument reopened = Loader.loadPDF(out)) {
                assertTrue(
                        pageHasImage(reopened.getPage(0)),
                        "native unavailable on an unreliable-font doc must fail closed -> rasterise");
            }
        } finally {
            RedactionPipeline.setJpdfiumAvailableForTest(true);
        }
    }

    @Test
    @DisplayName("verify gate distrusts a subset-embedded font's /ToUnicode (must-fix-4)")
    void gateRunsForSubsetFontEvenWithToUnicode() throws Exception {
        byte[] bytes;
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            PDFont font;
            try (var ttf = PDDocument.class.getResourceAsStream(LIBERATION)) {
                font = PDType0Font.load(doc, ttf, true); // Type0 -> /ToUnicode present
            }
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(font, 12);
                cs.newLineAtOffset(72, 700);
                cs.showText("subset text");
                cs.endText();
            }
            // Force the subset tag so the test is deterministic regardless of save-time subsetting.
            String tagged = "ABCDEF+" + font.getName();
            font.getCOSObject().setName(COSName.BASE_FONT, tagged);
            if (font.getFontDescriptor() != null) {
                font.getFontDescriptor().getCOSObject().setName(COSName.FONT_NAME, tagged);
            }
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            doc.save(b);
            bytes = b.toByteArray();
        }
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            assertTrue(
                    RedactionPipeline.documentHasUnreliableFont(reopened),
                    "a subset-embedded font's /ToUnicode must not be trusted (must-fix-4)");
        }
    }

    @Test
    @DisplayName("manual area over part of a run removes only the boxed glyphs, not the whole run")
    void manualAreaRemovesOnlyBoxedGlyphs() throws Exception {
        float fontSize = 16f;
        float startX = 72f;
        float baselineY = 700f;
        PDType1Font font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        String prefix = "Label: ";
        String target = "SECRET";
        byte[] out;
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(font, fontSize);
                cs.newLineAtOffset(startX, baselineY);
                cs.showText(prefix + target + " value");
                cs.endText();
            }
            float rectX = startX + font.getStringWidth(prefix) / 1000f * fontSize;
            float targetW = font.getStringWidth(target) / 1000f * fontSize;
            PDRectangle rect = new PDRectangle(rectX, baselineY - fontSize, targetW, 3 * fontSize);
            Map<Integer, List<PDRectangle>> rectsByPage = new HashMap<>();
            rectsByPage.put(0, List.of(rect));
            RedactionPipeline.RedactionResult result =
                    RedactionPipeline.redactAreas(doc, rectsByPage, Color.BLACK);
            out =
                    RedactionPipeline.finalizeAreas(
                            doc,
                            rectsByPage,
                            result.getForceRasterPages(),
                            result.getCapturedStrings());
        }
        try (PDDocument reopened = Loader.loadPDF(out)) {
            String text = new PDFTextStripper().getText(reopened);
            assertFalse(text.contains("SECRET"), "boxed target must be removed");
            assertTrue(text.contains("Label:"), "text left of the box must survive");
            assertTrue(text.contains("value"), "text right of the box must survive");
            assertFalse(pageHasImage(reopened.getPage(0)), "should be surgical, not rasterised");
        }
    }

    @Test
    @DisplayName("metadata scrub keeps non-matching Info entries and strips only the target")
    void metadataScrubIsTargetScoped() throws Exception {
        byte[] bytes;
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            org.apache.pdfbox.pdmodel.PDDocumentInformation info = doc.getDocumentInformation();
            info.setTitle("Quarterly Public Report");
            info.setAuthor("Written by Smith");
            info.setCustomMetadataValue("CaseName", "Smith matter");
            CatalogScrubber.scrub(
                    doc, new LinkedHashSet<>(Set.of("Smith")), Collections.emptyList());
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            doc.save(b);
            bytes = b.toByteArray();
        }
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            org.apache.pdfbox.pdmodel.PDDocumentInformation info =
                    reopened.getDocumentInformation();
            assertEquals(
                    "Quarterly Public Report", info.getTitle(), "non-matching Title must survive");
            assertFalse(info.getAuthor().contains("Smith"), "matching Author must be scrubbed");
        }
    }

    @Test
    @DisplayName("XMP metadata scrub strips only the target and keeps non-matching properties")
    void xmpScrubIsTargetScoped() throws Exception {
        String xmp =
                "<?xpacket begin=\"\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>\n"
                        + "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\">\n"
                        + " <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n"
                        + "  <rdf:Description rdf:about=\"\""
                        + " xmlns:dc=\"http://purl.org/dc/elements/1.1/\">\n"
                        + "   <dc:title>Quarterly Public Report</dc:title>\n"
                        + "   <dc:creator>Written by Smith</dc:creator>\n"
                        + "  </rdf:Description>\n"
                        + " </rdf:RDF>\n"
                        + "</x:xmpmeta>\n"
                        + "<?xpacket end=\"w\"?>";
        byte[] bytes;
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            doc.getDocumentCatalog()
                    .setMetadata(
                            new org.apache.pdfbox.pdmodel.common.PDMetadata(
                                    doc,
                                    new java.io.ByteArrayInputStream(
                                            xmp.getBytes(StandardCharsets.UTF_8))));
            CatalogScrubber.scrub(
                    doc, new LinkedHashSet<>(Set.of("Smith")), Collections.emptyList());
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            doc.save(b);
            bytes = b.toByteArray();
        }
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            org.apache.pdfbox.pdmodel.common.PDMetadata md =
                    reopened.getDocumentCatalog().getMetadata();
            assertNotNull(md, "XMP packet must be preserved, not wiped");
            String out = new String(md.toByteArray(), StandardCharsets.UTF_8);
            assertFalse(out.contains("Smith"), "target must be stripped from XMP");
            assertTrue(
                    out.contains("Quarterly Public Report"),
                    "non-matching XMP property must survive");
        }
    }

    private static boolean pageHasImage(PDPage page) throws Exception {
        PDResources res = page.getResources();
        if (res == null) {
            return false;
        }
        for (COSName n : res.getXObjectNames()) {
            if (res.getXObject(n) instanceof PDImageXObject) {
                return true;
            }
        }
        return false;
    }
}
