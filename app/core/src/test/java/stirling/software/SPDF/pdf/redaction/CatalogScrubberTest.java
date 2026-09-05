package stirling.software.SPDF.pdf.redaction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSDictionary;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSStream;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationHighlight;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDDocumentOutline;
import org.apache.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineItem;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDTextField;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("CatalogScrubber")
class CatalogScrubberTest {

    private static Set<String> targets(String... values) {
        return new LinkedHashSet<>(List.of(values));
    }

    // Carrier deletion must require a real match, not just size

    @Test
    @DisplayName("a large embedded file with no match survives the scrub")
    void largeCleanCarrierSurvives() throws Exception {
        // 4 MiB, comfortably past the old 2 MiB threshold that used to imply deletion.
        byte[] bytes = withEmbeddedFile("payload", "harmless filler content ".repeat(180_000));
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            assertEquals(1, embeddedFileCount(reopened), "clean carrier must not be dropped");
        }
    }

    @Test
    @DisplayName("an embedded file containing the target is removed")
    void matchingCarrierRemoved() throws Exception {
        // Match sits past 2 MiB, so only a whole-stream scan can find it.
        byte[] bytes = withEmbeddedFile("payload", "filler ".repeat(400_000) + " Smith owed us");
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            assertEquals(0, embeddedFileCount(reopened), "matching carrier must be dropped");
        }
    }

    @Test
    @DisplayName("a large carrier is not dropped just because a regex target exists")
    void largeCarrierSurvivesNonMatchingPattern() throws Exception {
        byte[] bytes =
                withEmbeddedFile(
                        "payload",
                        "harmless filler content ".repeat(180_000),
                        Set.of(),
                        List.of(Pattern.compile("\\d{3}-\\d{2}-\\d{4}")));
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            assertEquals(
                    1,
                    embeddedFileCount(reopened),
                    "stream size alone must never imply carrier deletion");
        }
    }

    @Test
    @DisplayName("a regex target matching past 2 MiB still drops the carrier")
    void largeCarrierWithLateRegexMatchRemoved() throws Exception {
        byte[] bytes =
                withEmbeddedFile(
                        "payload",
                        "filler ".repeat(400_000) + " 123-45-6789",
                        Set.of(),
                        List.of(Pattern.compile("\\d{3}-\\d{2}-\\d{4}")));
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            assertEquals(0, embeddedFileCount(reopened), "a late regex match must still be found");
        }
    }

    @Test
    @DisplayName("a substring-but-not-word occurrence does not drop the carrier")
    void substringOnlyCarrierSurvives() throws Exception {
        // "Ltd" occurs inside "Ltda" and "sLtdx" but never as a standalone word.
        byte[] bytes =
                withEmbeddedFile("payload", "Ltda sLtdx blacksmithing ", targets("Ltd", "Smith"));
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            assertEquals(
                    1, embeddedFileCount(reopened), "substring-only match must not drop a carrier");
        }
    }

    @Test
    @DisplayName("document JavaScript is dropped only when it really contains the target")
    void javaScriptDroppedOnlyOnRealMatch() throws Exception {
        assertEquals(1, javaScriptCount(withJavaScript("app.alert('Smithers');")));
        assertEquals(0, javaScriptCount(withJavaScript("app.alert('Smith owes');")));
    }

    // Carrier scrubbing

    @Test
    @DisplayName("bookmark titles, form field values and annotation contents are scrubbed")
    void scrubRemovesTargetFromCarriers() throws Exception {
        byte[] bytes;
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);

            PDDocumentOutline outline = new PDDocumentOutline();
            doc.getDocumentCatalog().setDocumentOutline(outline);
            PDOutlineItem item = new PDOutlineItem();
            item.setTitle("See page on Smith case");
            outline.addLast(item);

            PDAcroForm form = new PDAcroForm(doc);
            doc.getDocumentCatalog().setAcroForm(form);
            PDTextField field = new PDTextField(form);
            field.setPartialName("comments");
            field.getCOSObject().setString(COSName.V, "Paid by Smith on receipt");
            form.getFields().add(field);

            PDAnnotationHighlight annotation = new PDAnnotationHighlight();
            annotation.setContents("Note about Smith purchase");
            annotation.setRectangle(new PDRectangle(10, 10, 100, 20));
            page.getAnnotations().add(annotation);

            CatalogScrubber.scrub(doc, targets("Smith"), Collections.emptyList());
            bytes = save(doc);
        }

        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            assertFalse(
                    reopened.getDocumentCatalog()
                            .getDocumentOutline()
                            .getFirstChild()
                            .getTitle()
                            .contains("Smith"),
                    "bookmark titles must be scrubbed");
            assertFalse(
                    reopened.getDocumentCatalog()
                            .getAcroForm()
                            .getField("comments")
                            .getValueAsString()
                            .contains("Smith"),
                    "AcroForm field values must be scrubbed");
            assertFalse(
                    reopened.getPage(0).getAnnotations().get(0).getContents().contains("Smith"),
                    "annotation contents must be scrubbed");
        }
    }

    @Test
    @DisplayName("stripMatches removes every case variant of the target")
    void stripMatchesIsCaseInsensitive() {
        String result =
                CatalogScrubber.stripMatches(
                        "SMITH, John (also known as smith and Smith Jr.)",
                        targets("Smith"),
                        List.of());
        assertFalse(result.toLowerCase().contains("smith"), "actual='" + result + "'");
    }

    @Test
    @DisplayName("matched form fields lose their /AP, untouched fields keep theirs")
    void appearanceStreamsClearedOnlyWhereMatched() throws Exception {
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

            CatalogScrubber.scrub(doc, targets("Smith"), Collections.emptyList());

            assertNull(hit.getCOSObject().getDictionaryObject(COSName.AP));
            assertNotNull(clean.getCOSObject().getDictionaryObject(COSName.AP));
            assertTrue(form.getNeedAppearances());
        }
    }

    @Test
    @DisplayName("XFA packet carrying the target is dropped")
    void xfaPacketDropped() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            PDAcroForm form = new PDAcroForm(doc);
            doc.getDocumentCatalog().setAcroForm(form);
            form.getCOSObject()
                    .setItem(
                            COSName.XFA,
                            streamOf(doc, "<xdp><data><field>Smith</field></data></xdp>"));

            CatalogScrubber.scrub(doc, targets("Smith"), Collections.emptyList());

            assertNull(form.getCOSObject().getDictionaryObject(COSName.XFA));
        }
    }

    @Test
    @DisplayName("XFA packet without the target survives")
    void xfaPacketWithoutTargetSurvives() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            PDAcroForm form = new PDAcroForm(doc);
            doc.getDocumentCatalog().setAcroForm(form);
            form.getCOSObject()
                    .setItem(
                            COSName.XFA,
                            streamOf(doc, "<xdp><data><field>Jones</field></data></xdp>"));

            CatalogScrubber.scrub(doc, targets("Smith"), Collections.emptyList());

            assertNotNull(form.getCOSObject().getDictionaryObject(COSName.XFA));
        }
    }

    @Test
    @DisplayName("OpenAction and bookmark actions carrying the target are removed")
    void actionsCarryingTargetRemoved() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            doc.getDocumentCatalog()
                    .getCOSObject()
                    .setItem(
                            COSName.getPDFName("OpenAction"),
                            uriAction("https://example.com/?user=Smith"));

            PDDocumentOutline outline = new PDDocumentOutline();
            doc.getDocumentCatalog().setDocumentOutline(outline);
            PDOutlineItem item = new PDOutlineItem();
            item.setTitle("Link to case file");
            item.getCOSObject().setItem(COSName.A, uriAction("https://example.com/?file=Smith"));
            outline.addLast(item);

            CatalogScrubber.scrub(doc, targets("Smith"), Collections.emptyList());

            assertNull(
                    doc.getDocumentCatalog()
                            .getCOSObject()
                            .getDictionaryObject(COSName.getPDFName("OpenAction")));
            assertNull(item.getCOSObject().getDictionaryObject(COSName.A));
        }
    }

    @Test
    @DisplayName("metadata scrub keeps non-matching Info entries")
    void metadataScrubIsTargetScoped() throws Exception {
        byte[] bytes;
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));
            PDDocumentInformation info = doc.getDocumentInformation();
            info.setTitle("Quarterly Public Report");
            info.setAuthor("Written by Smith");
            CatalogScrubber.scrub(doc, targets("Smith"), Collections.emptyList());
            bytes = save(doc);
        }
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            PDDocumentInformation info = reopened.getDocumentInformation();
            assertEquals("Quarterly Public Report", info.getTitle());
            assertFalse(info.getAuthor().contains("Smith"));
        }
    }

    @Test
    @DisplayName("XMP scrub strips only the target and keeps the packet")
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
                            new PDMetadata(
                                    doc,
                                    new ByteArrayInputStream(
                                            xmp.getBytes(StandardCharsets.UTF_8))));
            CatalogScrubber.scrub(doc, targets("Smith"), Collections.emptyList());
            bytes = save(doc);
        }
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            PDMetadata md = reopened.getDocumentCatalog().getMetadata();
            assertNotNull(md, "XMP packet must be preserved, not wiped");
            String out = new String(md.toByteArray(), StandardCharsets.UTF_8);
            assertFalse(out.contains("Smith"));
            assertTrue(out.contains("Quarterly Public Report"));
        }
    }

    // Helpers

    private static byte[] withEmbeddedFile(String name, String content) throws Exception {
        return withEmbeddedFile(name, content, targets("Smith"));
    }

    private static byte[] withEmbeddedFile(String name, String content, Set<String> scrubTargets)
            throws Exception {
        return withEmbeddedFile(name, content, scrubTargets, List.of());
    }

    private static byte[] withEmbeddedFile(
            String name, String content, Set<String> scrubTargets, List<Pattern> scrubPatterns)
            throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));

            COSDictionary fileSpec = new COSDictionary();
            fileSpec.setItem(COSName.TYPE, COSName.getPDFName("Filespec"));
            fileSpec.setString(COSName.F, name + ".txt");
            COSDictionary ef = new COSDictionary();
            ef.setItem(COSName.F, streamOf(doc, content));
            fileSpec.setItem(COSName.getPDFName("EF"), ef);

            COSArray names = new COSArray();
            names.add(new COSString(name));
            names.add(fileSpec);
            COSDictionary embeddedFiles = new COSDictionary();
            embeddedFiles.setItem(COSName.NAMES, names);
            COSDictionary namesDict = new COSDictionary();
            namesDict.setItem(COSName.EMBEDDED_FILES, embeddedFiles);
            doc.getDocumentCatalog().getCOSObject().setItem(COSName.NAMES, namesDict);

            CatalogScrubber.scrub(doc, scrubTargets, scrubPatterns);
            return save(doc);
        }
    }

    private static int embeddedFileCount(PDDocument doc) {
        return nameCount(doc, COSName.EMBEDDED_FILES);
    }

    private static byte[] withJavaScript(String script) throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage(PDRectangle.A4));

            COSDictionary action = new COSDictionary();
            action.setItem(COSName.S, COSName.getPDFName("JavaScript"));
            action.setItem(COSName.JS, streamOf(doc, script));

            COSArray names = new COSArray();
            names.add(new COSString("script1"));
            names.add(action);
            COSDictionary js = new COSDictionary();
            js.setItem(COSName.NAMES, names);
            COSDictionary namesDict = new COSDictionary();
            namesDict.setItem(COSName.JAVA_SCRIPT, js);
            doc.getDocumentCatalog().getCOSObject().setItem(COSName.NAMES, namesDict);

            CatalogScrubber.scrub(doc, targets("Smith"), Collections.emptyList());
            return save(doc);
        }
    }

    private static int javaScriptCount(byte[] bytes) throws Exception {
        try (PDDocument reopened = Loader.loadPDF(bytes)) {
            return nameCount(reopened, COSName.JAVA_SCRIPT);
        }
    }

    private static int nameCount(PDDocument doc, COSName kind) {
        COSDictionary namesDict =
                doc.getDocumentCatalog().getCOSObject().getCOSDictionary(COSName.NAMES);
        if (namesDict == null) {
            return 0;
        }
        COSDictionary node = namesDict.getCOSDictionary(kind);
        if (node == null) {
            return 0;
        }
        COSArray names = node.getCOSArray(COSName.NAMES);
        return names == null ? 0 : names.size() / 2;
    }

    private static COSDictionary uriAction(String uri) {
        COSDictionary action = new COSDictionary();
        action.setItem(COSName.S, COSName.URI);
        action.setItem(COSName.URI, new COSString(uri));
        return action;
    }

    private static COSStream streamOf(PDDocument doc, String content) throws Exception {
        COSStream stream = doc.getDocument().createCOSStream();
        try (var out = stream.createOutputStream()) {
            out.write(content.getBytes(StandardCharsets.UTF_8));
        }
        return stream;
    }

    private static byte[] save(PDDocument doc) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        doc.save(baos);
        return baos.toByteArray();
    }
}
