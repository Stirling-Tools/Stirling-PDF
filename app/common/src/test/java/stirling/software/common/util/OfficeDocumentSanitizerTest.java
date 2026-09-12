package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Random;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.SsrfProtectionService;

class OfficeDocumentSanitizerTest {

    private static final byte[] COMPOUND_FILE_MAGIC = {
        (byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, (byte) 0xA1, (byte) 0xB1, 0x1A, (byte) 0xE1
    };

    private static final byte[] RTF_MAGIC = {'{', 0x5C, 'r', 't', 'f', '1', 0x5C, 'a'};

    private static final String EXTERNAL_URL = "https://webhook.site/ssrf-callback";
    private static final String INTERNAL_TARGET = "media/image1.png";

    private static final String DOCX_RELS =
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                    + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                    + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\""
                    + " Target=\""
                    + EXTERNAL_URL
                    + "\" TargetMode=\"External\"/>"
                    + "<Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\""
                    + " Target=\""
                    + INTERNAL_TARGET
                    + "\"/>"
                    + "</Relationships>";

    private static final String DOCX_DOCUMENT =
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                    + "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">"
                    + "<w:body><w:p/></w:body></w:document>";

    private static final String ODF_CONTENT_EXTERNAL =
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                    + "<office:document-content"
                    + " xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\""
                    + " xmlns:draw=\"urn:oasis:names:tc:opendocument:xmlns:drawing:1.0\""
                    + " xmlns:xlink=\"http://www.w3.org/1999/xlink\">"
                    + "<office:body><office:text>"
                    + "<draw:frame><draw:image xlink:href=\""
                    + EXTERNAL_URL
                    + "\" xlink:type=\"simple\"/></draw:frame>"
                    + "<draw:frame><draw:image xlink:href=\"Pictures/image1.png\" xlink:type=\"simple\"/></draw:frame>"
                    + "</office:text></office:body></office:document-content>";

    private SsrfProtectionService ssrfProtectionService;
    private ApplicationProperties applicationProperties;
    private OfficeDocumentSanitizer sanitizer;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        ssrfProtectionService = mock(SsrfProtectionService.class);
        sanitizer = new OfficeDocumentSanitizer(ssrfProtectionService, applicationProperties);
    }

    @Test
    void sanitize_stripsOoxmlExternalRelationship() throws IOException {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("word/_rels/document.xml.rels", DOCX_RELS.getBytes(StandardCharsets.UTF_8));
        entries.put("word/document.xml", DOCX_DOCUMENT.getBytes(StandardCharsets.UTF_8));
        byte[] docx = zip(entries);

        byte[] cleaned = sanitizer.sanitize(docx);

        Map<String, byte[]> result = unzip(cleaned);
        String rels =
                new String(result.get("word/_rels/document.xml.rels"), StandardCharsets.UTF_8);
        assertFalse(rels.contains(EXTERNAL_URL), "External URL should be stripped from .rels");
        assertFalse(
                rels.toLowerCase().contains("targetmode=\"external\""),
                "TargetMode=External relationship should be removed");
        assertTrue(rels.contains(INTERNAL_TARGET), "Internal image target should be preserved");
        assertArrayEquals(
                DOCX_DOCUMENT.getBytes(StandardCharsets.UTF_8),
                result.get("word/document.xml"),
                "Non-rels entries must be untouched");
    }

    @Test
    void sanitize_pptxExternalImageRelStripped() throws IOException {
        String pptxRels =
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                        + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                        + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\""
                        + " Target=\""
                        + EXTERNAL_URL
                        + "\" TargetMode=\"External\"/>"
                        + "</Relationships>";
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("ppt/slides/_rels/slide1.xml.rels", pptxRels.getBytes(StandardCharsets.UTF_8));
        byte[] pptx = zip(entries);

        byte[] cleaned = sanitizer.sanitize(pptx);

        Map<String, byte[]> result = unzip(cleaned);
        String rels =
                new String(result.get("ppt/slides/_rels/slide1.xml.rels"), StandardCharsets.UTF_8);
        assertFalse(rels.contains(EXTERNAL_URL));
    }

    @Test
    void sanitize_xlsxExternalImageRelStripped() throws IOException {
        String xlsxRels =
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                        + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                        + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\""
                        + " Target=\""
                        + EXTERNAL_URL
                        + "\" TargetMode=\"External\"/>"
                        + "</Relationships>";
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put(
                "xl/drawings/_rels/drawing1.xml.rels", xlsxRels.getBytes(StandardCharsets.UTF_8));
        byte[] xlsx = zip(entries);

        byte[] cleaned = sanitizer.sanitize(xlsx);

        Map<String, byte[]> result = unzip(cleaned);
        String rels =
                new String(
                        result.get("xl/drawings/_rels/drawing1.xml.rels"), StandardCharsets.UTF_8);
        assertFalse(rels.contains(EXTERNAL_URL));
    }

    @Test
    void sanitize_odtStripsExternalXlinkHrefButKeepsInternal() throws IOException {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("content.xml", ODF_CONTENT_EXTERNAL.getBytes(StandardCharsets.UTF_8));
        String manifestXml =
                "<?xml version=\"1.0\"?><manifest:manifest"
                        + " xmlns:manifest=\"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0\"/>";
        entries.put("META-INF/manifest.xml", manifestXml.getBytes(StandardCharsets.UTF_8));
        byte[] odt = zip(entries);

        byte[] cleaned = sanitizer.sanitize(odt);

        Map<String, byte[]> result = unzip(cleaned);
        String content = new String(result.get("content.xml"), StandardCharsets.UTF_8);
        assertFalse(content.contains(EXTERNAL_URL), "External xlink:href should be stripped");
        assertTrue(content.contains("Pictures/image1.png"), "Internal href should be preserved");
    }

    @Test
    void sanitize_odsStripsExternalXlinkHref() throws IOException {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("content.xml", ODF_CONTENT_EXTERNAL.getBytes(StandardCharsets.UTF_8));
        byte[] ods = zip(entries);

        byte[] cleaned = sanitizer.sanitize(ods);

        Map<String, byte[]> result = unzip(cleaned);
        String content = new String(result.get("content.xml"), StandardCharsets.UTF_8);
        assertFalse(content.contains(EXTERNAL_URL));
    }

    @Test
    void sanitize_odpStripsExternalXlinkHrefInStylesXml() throws IOException {
        String stylesXml =
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                        + "<office:document-styles"
                        + " xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\""
                        + " xmlns:draw=\"urn:oasis:names:tc:opendocument:xmlns:drawing:1.0\""
                        + " xmlns:xlink=\"http://www.w3.org/1999/xlink\">"
                        + "<draw:image xlink:href=\""
                        + EXTERNAL_URL
                        + "\"/></office:document-styles>";
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("styles.xml", stylesXml.getBytes(StandardCharsets.UTF_8));
        byte[] odp = zip(entries);

        byte[] cleaned = sanitizer.sanitize(odp);

        Map<String, byte[]> result = unzip(cleaned);
        String content = new String(result.get("styles.xml"), StandardCharsets.UTF_8);
        assertFalse(content.contains(EXTERNAL_URL));
    }

    @Test
    void sanitize_disabledByConfigReturnsOriginal() throws IOException {
        applicationProperties.getSystem().setDisableSanitize(true);
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("word/_rels/document.xml.rels", DOCX_RELS.getBytes(StandardCharsets.UTF_8));
        byte[] docx = zip(entries);

        byte[] result = sanitizer.sanitize(docx);
        assertArrayEquals(docx, result);
    }

    @Test
    void sanitize_unrecognizedExtensionReturnsOriginal() throws IOException {
        byte[] original = "irrelevant".getBytes(StandardCharsets.UTF_8);
        byte[] result = sanitizer.sanitize(original);
        assertArrayEquals(original, result);
    }

    @Test
    void sanitize_emptyInputThrows() {
        assertThrows(IOException.class, () -> sanitizer.sanitize(new byte[0]));
    }

    @Test
    void sanitize_nullInputThrows() {
        assertThrows(IOException.class, () -> sanitizer.sanitize(null));
    }

    @Test
    void sanitize_preservesEntryWithExternalRefWhenAdminAllowsDomain() throws IOException {
        applicationProperties
                .getSystem()
                .getHtml()
                .getUrlSecurity()
                .getAllowedDomains()
                .add("webhook.site");
        lenient().when(ssrfProtectionService.isUrlAllowed(eq(EXTERNAL_URL))).thenReturn(true);

        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("word/_rels/document.xml.rels", DOCX_RELS.getBytes(StandardCharsets.UTF_8));
        byte[] docx = zip(entries);

        byte[] cleaned = sanitizer.sanitize(docx);

        Map<String, byte[]> result = unzip(cleaned);
        String rels =
                new String(result.get("word/_rels/document.xml.rels"), StandardCharsets.UTF_8);
        assertTrue(rels.contains(EXTERNAL_URL), "Allow-listed external URL should be preserved");
    }

    @Test
    void sanitize_doesNotConsultSsrfServiceWhenAllowedDomainsEmpty() throws IOException {
        // Even if mock would say allowed, we should not invoke it when there is no allow-list,
        // because MEDIUM default would let public URLs through and re-introduce the vulnerability.
        lenient().when(ssrfProtectionService.isUrlAllowed(eq(EXTERNAL_URL))).thenReturn(true);

        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("word/_rels/document.xml.rels", DOCX_RELS.getBytes(StandardCharsets.UTF_8));
        byte[] docx = zip(entries);

        byte[] cleaned = sanitizer.sanitize(docx);

        Map<String, byte[]> result = unzip(cleaned);
        String rels =
                new String(result.get("word/_rels/document.xml.rels"), StandardCharsets.UTF_8);
        assertFalse(rels.contains(EXTERNAL_URL));
    }

    @Test
    void sanitize_handlesNonXmlEntriesSafely() throws IOException {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        byte[] imageBytes = new byte[] {(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a};
        entries.put("word/media/image1.png", imageBytes);
        entries.put("word/_rels/document.xml.rels", DOCX_RELS.getBytes(StandardCharsets.UTF_8));
        byte[] docx = zip(entries);

        byte[] cleaned = sanitizer.sanitize(docx);

        Map<String, byte[]> result = unzip(cleaned);
        assertArrayEquals(imageBytes, result.get("word/media/image1.png"));
    }

    @Test
    void sanitize_internalLinksKeptWhenNoExternalPresent() throws IOException {
        String internalOnlyRels =
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                        + "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                        + "<Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/image\""
                        + " Target=\"media/image1.png\"/>"
                        + "</Relationships>";
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put(
                "word/_rels/document.xml.rels", internalOnlyRels.getBytes(StandardCharsets.UTF_8));
        byte[] docx = zip(entries);

        byte[] cleaned = sanitizer.sanitize(docx);

        Map<String, byte[]> result = unzip(cleaned);
        String rels =
                new String(result.get("word/_rels/document.xml.rels"), StandardCharsets.UTF_8);
        assertTrue(rels.contains("media/image1.png"));
    }

    @Test
    void sanitize_corruptZipProducesSafeOutput() throws IOException {
        byte[] garbage = "this is not a zip file".getBytes(StandardCharsets.UTF_8);
        byte[] result = sanitizer.sanitize(garbage);
        Map<String, byte[]> entries = unzip(result);
        assertTrue(entries.isEmpty(), "Garbage input must not yield exploitable entries");
    }

    @Test
    void sanitize_relativeOdfPathsArePreserved() throws IOException {
        String content =
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                        + "<office:document-content"
                        + " xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\""
                        + " xmlns:draw=\"urn:oasis:names:tc:opendocument:xmlns:drawing:1.0\""
                        + " xmlns:xlink=\"http://www.w3.org/1999/xlink\">"
                        + "<draw:image xlink:href=\"../Pictures/image1.png\"/>"
                        + "<draw:image xlink:href=\"#anchor\"/>"
                        + "</office:document-content>";
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("content.xml", content.getBytes(StandardCharsets.UTF_8));
        byte[] odt = zip(entries);

        byte[] cleaned = sanitizer.sanitize(odt);

        Map<String, byte[]> result = unzip(cleaned);
        String out = new String(result.get("content.xml"), StandardCharsets.UTF_8);
        assertTrue(out.contains("../Pictures/image1.png"));
        assertTrue(out.contains("#anchor"));
    }

    private static String flatOdf(String href) {
        return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                + "<office:document"
                + " xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\""
                + " xmlns:text=\"urn:oasis:names:tc:opendocument:xmlns:text:1.0\""
                + " xmlns:draw=\"urn:oasis:names:tc:opendocument:xmlns:drawing:1.0\""
                + " xmlns:xlink=\"http://www.w3.org/1999/xlink\""
                + " office:mimetype=\"application/vnd.oasis.opendocument.text\">"
                + "<office:body><office:text>"
                + "<draw:frame><draw:image xlink:href=\""
                + href
                + "\"/></draw:frame>"
                + "</office:text></office:body></office:document>";
    }

    @Test
    void sanitize_flatOdfStripsExternalHref() throws IOException {
        byte[] fodt = flatOdf(EXTERNAL_URL).getBytes(StandardCharsets.UTF_8);
        String out = new String(sanitizer.sanitize(fodt), StandardCharsets.UTF_8);
        assertFalse(out.contains(EXTERNAL_URL), "flat-ODF external href must be stripped");
    }

    @Test
    void sanitize_flatOdfStripsFileHrefLocalReadback() throws IOException {
        // Local-file readback (#7628): file:// reference must be removed before LibreOffice.
        byte[] fodt = flatOdf("file:///etc/passwd").getBytes(StandardCharsets.UTF_8);
        String out = new String(sanitizer.sanitize(fodt), StandardCharsets.UTF_8);
        assertFalse(out.contains("file:///etc/passwd"), "flat-ODF file: href must be stripped");
    }

    @Test
    void sanitize_flatOdfKeepsInDocumentRefsAndInlineData() throws IOException {
        // A single-file doc legitimately references only in-document anchors and data: URIs.
        byte[] anchor = flatOdf("#anchor").getBytes(StandardCharsets.UTF_8);
        byte[] inline =
                flatOdf("data:image/png;base64,iVBORw0KGgo=").getBytes(StandardCharsets.UTF_8);
        assertTrue(
                new String(sanitizer.sanitize(anchor), StandardCharsets.UTF_8).contains("#anchor"));
        assertTrue(
                new String(sanitizer.sanitize(inline), StandardCharsets.UTF_8)
                        .contains("data:image/png;base64"));
    }

    @Test
    void sanitize_flatOdfStripsTraversalAndAbsolutePaths() throws IOException {
        // #7628 H1: flat XML has no package, so ../ traversal and absolute paths are external.
        for (String href :
                new String[] {
                    "../../../../etc/passwd", "/etc/passwd", "\\\\attacker\\share\\x", "C:/secret"
                }) {
            byte[] fodt = flatOdf(href).getBytes(StandardCharsets.UTF_8);
            String out = new String(sanitizer.sanitize(fodt), StandardCharsets.UTF_8);
            assertFalse(out.contains(href), "flat-ODF must strip filesystem ref: " + href);
        }
    }

    @Test
    void sanitize_flatOdfDoctypeDoesNotFailOpen() throws IOException {
        // #7628 C1: a DOCTYPE makes the strict parser reject the doc; must NOT pass through raw.
        String doc =
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                        + "<!DOCTYPE office:document>"
                        + "<office:document"
                        + " xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\""
                        + " xmlns:draw=\"urn:oasis:names:tc:opendocument:xmlns:drawing:1.0\""
                        + " xmlns:xlink=\"http://www.w3.org/1999/xlink\">"
                        + "<office:body><office:text><draw:frame>"
                        + "<draw:image xlink:href=\"file:///etc/passwd\"/>"
                        + "</draw:frame></office:text></office:body></office:document>";
        byte[] fodt = doc.getBytes(StandardCharsets.UTF_8);
        String out = new String(sanitizer.sanitize(fodt), StandardCharsets.UTF_8);
        assertFalse(out.contains("file:///etc/passwd"), "DOCTYPE payload must be sanitized");
    }

    @Test
    void sanitize_flatOdfStripsSrcAttribute() throws IOException {
        String doc =
                "<?xml version=\"1.0\"?><doc xmlns:xlink=\"http://www.w3.org/1999/xlink\">"
                        + "<img src=\"file:///etc/passwd\"/></doc>";
        String out =
                new String(
                        sanitizer.sanitize(doc.getBytes(StandardCharsets.UTF_8)),
                        StandardCharsets.UTF_8);
        assertFalse(out.contains("file:///etc/passwd"), "src attribute must be stripped");
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(
            strings = {
                "<not-well-formed <<< &amp",
                "<-- draft note\ncontent",
                "<p>hi<br>there</p>",
                "<table><tr><td><img src=\"" + EXTERNAL_URL + "\"></td></tr></table>",
                "<p>hi</p><img src=\"" + EXTERNAL_URL + "\">",
                "   \n\t <img src=\"" + EXTERNAL_URL + "\">",
                "<!DOCTYPE foo><html><body><img src=\"" + EXTERNAL_URL + "\"></body></html>",
                "<?xml version=\"1.0\"?><html><img src=\"" + EXTERNAL_URL + "\"></html>",
                "<![CDATA[x]]><html><img src=\"" + EXTERNAL_URL + "\"></html>",
                "  <html><img src=\"" + EXTERNAL_URL + "\"></html>",
                "<!-- pad --><table><img src=\"" + EXTERNAL_URL + "\"></table>",
                "\f<table><img src=\"" + EXTERNAL_URL + "\"></table>",
                "\f \f<html><img src=\"" + EXTERNAL_URL + "\"></html>"
            })
    void sanitize_markupThatIsNotWellFormedXmlNeedsTheHtmlSanitizer(String text) {
        // Verified against LibreOffice: it imports anything that opens with a tag through the HTML
        // filter and fetches what that markup references, whichever tag it opens with. Passing
        // these through as plain text is what let a payload behind a leading comment, a processing
        // instruction or a bare <table> reach the network.
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);

        assertThrows(
                OfficeDocumentSanitizer.HtmlMarkupException.class, () -> sanitizer.sanitize(bytes));
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(
            strings = {
                "Hello world\n<img src=\"http://example.invalid/x\">",
                "a,b\n1,2\n<img src=\"http://example.invalid/x\">",
                "plain note, nothing to parse"
            })
    void sanitize_textThatDoesNotOpenWithMarkupPassesThrough(String text) throws IOException {
        // Verified against LibreOffice: content whose first non-space byte is not '<' never
        // reaches the HTML filter, tags further in included, so .txt/.csv must still convert.
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);

        assertArrayEquals(bytes, sanitizer.sanitize(bytes));
    }

    @Test
    void sanitize_flatXmlStripsBackgroundAttribute() throws IOException {
        // background is the third attribute LibreOffice's HTML import fetches, alongside src and
        // href, and well-formed markup carrying it never reaches the HTML sanitizer.
        String doc = "<table background=\"" + EXTERNAL_URL + "\"><tr><td>x</td></tr></table>";

        String out =
                new String(
                        sanitizer.sanitize(doc.getBytes(StandardCharsets.UTF_8)),
                        StandardCharsets.UTF_8);

        assertFalse(out.contains(EXTERNAL_URL), "background attribute must be stripped");
    }

    @Test
    void sanitize_flatXmlKeepsAWordmlReferenceToItsOwnPicture() throws IOException {
        // MS Word 2003 XML carries its pictures in <w:binData> and addresses them by a wordml:
        // name. There is no protocol handler behind that name, so it reaches nothing outside the
        // file, and stripping it cost every WordML upload every picture it had.
        String doc =
                "<w:pict xmlns:w=\"urn:x\" xmlns:v=\"urn:v\">"
                        + "<w:binData w:name=\"wordml://Image1\">iVBORw0K</w:binData>"
                        + "<v:shape><v:imagedata src=\"wordml://Image1\"/></v:shape></w:pict>";

        byte[] sanitized = sanitizer.sanitize(doc.getBytes(StandardCharsets.UTF_8));

        assertTrue(
                new String(sanitized, StandardCharsets.UTF_8).contains("src=\"wordml://Image1\""),
                "an in-document picture reference must survive");
    }

    @Test
    void sanitize_zipWithARepeatedEntryNameIsRejectedWithoutNamingIt() throws IOException {
        // Readers disagree about which copy of a repeated name wins, so a package carrying one is
        // refused rather than rewritten — and refused under the fixed message, because the name is
        // attacker-chosen text that the ZipOutputStream complaint would otherwise put in the
        // response body.
        byte[] duplicated = withARepeatedEntryName(ODF_CONTENT_EXTERNAL);

        IOException refused = assertThrows(IOException.class, () -> sanitizer.sanitize(duplicated));

        assertFalse(refused.getMessage().contains(REPEATED_ENTRY_NAME));
    }

    private static final String REPEATED_ENTRY_NAME = "duplicate7680-x.xml";

    /**
     * A package declaring the same entry name twice. Written under two names of that same length
     * and renamed afterwards, because {@link ZipOutputStream} refuses to write the archive this
     * describes — which is the whole point of the test.
     */
    private static byte[] withARepeatedEntryName(String content) throws IOException {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("duplicate7680-a.xml", content.getBytes(StandardCharsets.UTF_8));
        entries.put("duplicate7680-b.xml", content.getBytes(StandardCharsets.UTF_8));

        return new String(zip(entries), StandardCharsets.ISO_8859_1)
                .replace("duplicate7680-a.xml", REPEATED_ENTRY_NAME)
                .replace("duplicate7680-b.xml", REPEATED_ENTRY_NAME)
                .getBytes(StandardCharsets.ISO_8859_1);
    }

    @Test
    void sanitize_wellFormedXmlBeyondParserLimitsIsRejected() {
        // Fail closed: well-formed XML the hardened parser refuses must never reach LibreOffice
        // unsanitized, or nesting past the limit would bypass sanitization.
        StringBuilder sb = new StringBuilder("<?xml version=\"1.0\"?><r>");
        int depth = 900; // past MAX_ELEMENT_DEPTH
        sb.append("<a>".repeat(depth));
        sb.append("<b/>");
        sb.append("</a>".repeat(depth));
        sb.append("</r>");
        byte[] tooDeep = sb.toString().getBytes(StandardCharsets.UTF_8);
        assertThrows(IOException.class, () -> sanitizer.sanitize(tooDeep));
    }

    @Test
    void sanitize_deeplyNestedZipPartCannotBypassSanitization() throws IOException {
        // Regression: secure processing caps element depth, and the zip path used to pass an
        // unparseable part through untouched, letting a nested href reach LibreOffice.
        StringBuilder sb = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>");
        sb.append(
                "<office:document-content"
                        + " xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\""
                        + " xmlns:table=\"urn:oasis:names:tc:opendocument:xmlns:table:1.0\""
                        + " xmlns:draw=\"urn:oasis:names:tc:opendocument:xmlns:drawing:1.0\""
                        + " xmlns:xlink=\"http://www.w3.org/1999/xlink\"><office:body><office:text>");
        int nesting = 100; // XML depth ~305: far past the JDK default of 100, inside our cap
        sb.append("<table:table><table:table-row><table:table-cell>".repeat(nesting));
        sb.append("<draw:frame><draw:image xlink:href=\"" + EXTERNAL_URL + "\"/></draw:frame>");
        sb.append("</table:table-cell></table:table-row></table:table>".repeat(nesting));
        sb.append("</office:text></office:body></office:document-content>");

        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("content.xml", sb.toString().getBytes(StandardCharsets.UTF_8));
        byte[] out = sanitizer.sanitize(zip(entries));

        String content = new String(unzip(out).get("content.xml"), StandardCharsets.UTF_8);
        assertFalse(content.contains(EXTERNAL_URL), "nested external href must still be stripped");
    }

    @Test
    void sanitize_zipPartBeyondDepthLimitIsRejectedNotPassedThrough() throws IOException {
        // Past the parser's depth cap there is nothing to strip with, so reject rather than
        // hand the document to LibreOffice unsanitized.
        StringBuilder sb =
                new StringBuilder(
                        "<?xml version=\"1.0\"?><office:document-content"
                                + " xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\">");
        int depth = 900; // past MAX_ELEMENT_DEPTH
        sb.append("<a>".repeat(depth));
        sb.append("</a>".repeat(depth));
        sb.append("</office:document-content>");
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("content.xml", sb.toString().getBytes(StandardCharsets.UTF_8));
        byte[] odt = zip(entries);
        assertThrows(IOException.class, () -> sanitizer.sanitize(odt));
    }

    @Test
    void sanitize_unparseableZipPartIsRejectedNotPassedThrough() throws IOException {
        // A part we cannot parse must not be handed to LibreOffice as-is.
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("content.xml", "<office:body <<< broken".getBytes(StandardCharsets.UTF_8));
        byte[] odt = zip(entries);
        assertThrows(IOException.class, () -> sanitizer.sanitize(odt));
    }

    @Test
    void sanitize_zipWithPrependedBytesIsRejectedNotPassedThrough() throws IOException {
        // LibreOffice finds the package from the end-of-central-directory record, so bytes
        // prepended ahead of the first local header still convert; the sanitizer must not
        // mistake them for an unknown binary and hand them over untouched.
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("content.xml", ODF_CONTENT_EXTERNAL.getBytes(StandardCharsets.UTF_8));
        byte[] odt = zip(entries);
        byte[] prefixed = new byte[100 + odt.length];
        System.arraycopy(odt, 0, prefixed, 100, odt.length);

        assertThrows(IOException.class, () -> sanitizer.sanitize(prefixed));
    }

    @Test
    void sanitize_zipWithArchiveCommentIsStillSanitized() throws IOException {
        // The EOCD scan has to walk back past a trailing archive comment.
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("content.xml", ODF_CONTENT_EXTERNAL.getBytes(StandardCharsets.UTF_8));
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            zos.setComment("x".repeat(4096));
            for (Map.Entry<String, byte[]> e : entries.entrySet()) {
                zos.putNextEntry(new ZipEntry(e.getKey()));
                zos.write(e.getValue());
                zos.closeEntry();
            }
        }

        byte[] cleaned = sanitizer.sanitize(baos.toByteArray());

        String content = new String(unzip(cleaned).get("content.xml"), StandardCharsets.UTF_8);
        assertFalse(content.contains(EXTERNAL_URL));
    }

    @ParameterizedTest(name = "signature at offset {0}")
    @ValueSource(ints = {8, 2048, 4074, 4090})
    void sanitize_binaryCarryingBareZipSignatureStillConverts(int signatureOffset)
            throws IOException {
        // A binary document with an embedded OOXML object leaves PK\x05\x06 lying in the stream;
        // only a complete end-of-central-directory record means the file is a container.
        byte[] binary = new byte[4096];
        System.arraycopy(RTF_MAGIC, 0, binary, 0, RTF_MAGIC.length);
        System.arraycopy(new byte[] {'P', 'K', 5, 6}, 0, binary, signatureOffset, 4);

        assertArrayEquals(binary, sanitizer.sanitize(binary));
    }

    @Test
    void sanitize_binaryWithBareZipSignatureAnywhereStillConverts() throws IOException {
        // Pinning a handful of offsets would leave the class open, so sweep random bodies with the
        // signature planted at a random offset: none may be taken for a ZIP container.
        Random random = new Random(20240607L);
        for (int trial = 0; trial < 5000; trial++) {
            byte[] binary = new byte[8192];
            random.nextBytes(binary);
            System.arraycopy(RTF_MAGIC, 0, binary, 0, RTF_MAGIC.length);
            int at = RTF_MAGIC.length + random.nextInt(binary.length - RTF_MAGIC.length - 40);
            System.arraycopy(new byte[] {'P', 'K', 5, 6}, 0, binary, at, 4);

            assertArrayEquals(
                    binary,
                    sanitizer.sanitize(binary),
                    "signature at offset " + at + " must not route to the ZIP path");
        }
    }

    @Test
    void sanitize_binaryWhoseStrayEocdCommentLengthFitsStillConverts() throws IOException {
        // Junk after a stray signature satisfies the comment length by chance once in 65536, so
        // the multi-disk numbers and the empty central directory have to carry the rejection.
        byte[] binary = new byte[4096];
        System.arraycopy(RTF_MAGIC, 0, binary, 0, RTF_MAGIC.length);
        int at = 4000;
        System.arraycopy(new byte[] {'P', 'K', 5, 6}, 0, binary, at, 4);
        writeShort(binary, at + 4, 7);
        writeShort(binary, at + 6, 7);
        writeShort(binary, at + 8, 3);
        writeShort(binary, at + 10, 3);
        writeShort(binary, at + 20, binary.length - at - 22);

        assertArrayEquals(binary, sanitizer.sanitize(binary));
    }

    @Test
    void sanitize_zipWithPrependedBytesAndArchiveCommentIsRejected() throws IOException {
        // The EOCD validation must not be defeated by a trailing archive comment.
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            zos.setComment("x".repeat(4096));
            zos.putNextEntry(new ZipEntry("content.xml"));
            zos.write(ODF_CONTENT_EXTERNAL.getBytes(StandardCharsets.UTF_8));
            zos.closeEntry();
        }
        byte[] odt = baos.toByteArray();
        byte[] prefixed = new byte[100 + odt.length];
        System.arraycopy(odt, 0, prefixed, 100, odt.length);

        assertThrows(IOException.class, () -> sanitizer.sanitize(prefixed));
    }

    @ParameterizedTest(name = "{0} trailing bytes")
    @ValueSource(ints = {1, 2, 21, 22, 23, 64, 1024, 65535})
    void sanitize_zipWithPrependedBytesAndTrailingJunkIsRejected(int trailing) throws IOException {
        // Appending junk moves the record off the final byte without stopping any reader finding
        // it, so requiring the record to close the file is a bypass, not a validation.
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("content.xml", ODF_CONTENT_EXTERNAL.getBytes(StandardCharsets.UTF_8));
        byte[] payload = concat(new byte[100], zip(entries), new byte[trailing]);

        assertThrows(IOException.class, () -> sanitizer.sanitize(payload));
    }

    @Test
    void sanitize_zipWithPrependedBytesIsRejectedAtEveryTrailingLength() throws IOException {
        // Verified against LibreOffice: it recovers the package from the local headers, so it opens
        // the file at every one of these lengths, 200000 trailing bytes included. Detection that
        // reads a fixed tail has a length that escapes it; detection from the local headers has
        // none, so the sweep runs past any window a tail scan could use.
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("content.xml", ODF_CONTENT_EXTERNAL.getBytes(StandardCharsets.UTF_8));
        byte[] odt = zip(entries);

        for (int trailing = 0; trailing <= 4096; trailing++) {
            assertPrefixedArchiveRejected(odt, trailing);
        }
        for (int trailing :
                new int[] {65513, 65535, 65536, 65557, 65558, 70000, 200000, 1_000_000}) {
            assertPrefixedArchiveRejected(odt, trailing);
        }
    }

    private void assertPrefixedArchiveRejected(byte[] odt, int trailing) {
        byte[] payload = concat(new byte[100], odt, new byte[trailing]);
        assertThrows(
                IOException.class,
                () -> sanitizer.sanitize(payload),
                () -> "prefixed archive with " + trailing + " trailing bytes was not rejected");
    }

    @ParameterizedTest(name = "end-of-central-directory field at offset {0} forged to {1}")
    @CsvSource({"4, 7", "6, 7", "8, 99", "10, 0", "12, 0", "20, 65535"})
    void sanitize_zipWithPrependedBytesIsRejectedWhateverTheEocdSays(int fieldOffset, int value)
            throws IOException {
        // Verified against LibreOffice: it opens the package with every one of these fields forged,
        // because it falls back to the local headers. Any detection that trusts a field of that
        // record is therefore two bytes away from being switched off by the attacker.
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("content.xml", ODF_CONTENT_EXTERNAL.getBytes(StandardCharsets.UTF_8));
        byte[] payload = concat(new byte[100], zip(entries));
        writeShort(payload, lastIndexOfEocd(payload) + fieldOffset, value);

        assertThrows(IOException.class, () -> sanitizer.sanitize(payload));
    }

    @Test
    void sanitize_zipIsRejectedAtEveryPrefixLength() throws IOException {
        // The prefix moves the local header off every fixed offset a head sniff could look at, and
        // the lengths either side of 64K and 128K land it across the scan's own read boundary,
        // where a header split between two blocks would otherwise go unseen.
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("content.xml", ODF_CONTENT_EXTERNAL.getBytes(StandardCharsets.UTF_8));
        byte[] odt = zip(entries);

        for (int prefix = 1; prefix <= 4096; prefix++) {
            assertPrefixRejected(odt, prefix);
        }
        for (int centre : new int[] {64 * 1024, 128 * 1024, 192 * 1024}) {
            for (int prefix = centre - 40; prefix <= centre + 40; prefix++) {
                assertPrefixRejected(odt, prefix);
            }
        }
    }

    private void assertPrefixRejected(byte[] odt, int prefix) {
        byte[] payload = concat(new byte[prefix], odt);
        assertThrows(
                IOException.class,
                () -> sanitizer.sanitize(payload),
                () -> "archive behind a " + prefix + " byte prefix was not rejected");
    }

    @ParameterizedTest(name = "compression method forged to {0}")
    @ValueSource(ints = {1, 12, 99, 65535})
    void sanitize_zipWithPrependedBytesIsRejectedWhateverTheCompressionMethodSays(int method)
            throws IOException {
        // Verified against LibreOffice: it opens a prefixed package whose every compression method
        // is forged, so the method is one more field that cannot be part of the container check.
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("content.xml", ODF_CONTENT_EXTERNAL.getBytes(StandardCharsets.UTF_8));
        byte[] payload = concat(new byte[100], zip(entries));
        forgeCompressionMethods(payload, method);

        assertThrows(IOException.class, () -> sanitizer.sanitize(payload));
    }

    private static void forgeCompressionMethods(byte[] b, int method) {
        for (int i = 0; i + 30 <= b.length; i++) {
            if (b[i] == 'P' && b[i + 1] == 'K' && b[i + 2] == 3 && b[i + 3] == 4) {
                writeShort(b, i + 8, method);
            } else if (b[i] == 'P' && b[i + 1] == 'K' && b[i + 2] == 1 && b[i + 3] == 2) {
                writeShort(b, i + 10, method);
            }
        }
    }

    private static int lastIndexOfEocd(byte[] b) {
        for (int i = b.length - 22; i >= 0; i--) {
            if (b[i] == 'P' && b[i + 1] == 'K' && b[i + 2] == 5 && b[i + 3] == 6) {
                return i;
            }
        }
        throw new IllegalStateException("no end-of-central-directory record in the fixture");
    }

    @ParameterizedTest(name = "{0} bytes of padding before the embedded package")
    @ValueSource(ints = {0, 1, 8, 512, 4096})
    void sanitize_compoundFileEmbeddingAnOoxmlObjectStillConverts(int padding) throws IOException {
        // A .doc/.xls/.ppt is a compound file, not a ZIP package; an OOXML object inside one leaves
        // whole local headers in the stream, and rejecting that would break documents that convert.
        byte[] embedded = zip(Map.of("word/document.xml", "<x/>".getBytes(StandardCharsets.UTF_8)));

        for (int trailing : new int[] {0, 1, 64, 1024}) {
            byte[] compound =
                    concat(
                            concat(compoundFileHeader(), new byte[padding]),
                            concat(embedded, new byte[trailing]));

            assertArrayEquals(compound, sanitizer.sanitize(compound));
        }
    }

    @ParameterizedTest(name = "{0} bytes of the compound file header")
    @ValueSource(ints = {8, 26, 28, 30, 32})
    void sanitize_zipBehindATruncatedCompoundFileHeaderIsRejected(int headerBytes)
            throws IOException {
        // Verified against LibreOffice: the magic alone does not make it read the file as a
        // compound file, so it recovers the appended package and opens that instead. Only a header
        // whose fields are all there commits it, so only that may turn the container check off.
        byte[] payload =
                concat(
                        java.util.Arrays.copyOf(compoundFileHeader(), headerBytes),
                        zip(
                                Map.of(
                                        "content.xml",
                                        ODF_CONTENT_EXTERNAL.getBytes(StandardCharsets.UTF_8))));

        assertThrows(IOException.class, () -> sanitizer.sanitize(payload));
    }

    @ParameterizedTest(name = "field at offset {0} forged to {1}")
    @CsvSource({"26, 9", "28, 0", "30, 12", "32, 7", "44, 0"})
    void sanitize_zipBehindAnInvalidCompoundFileHeaderIsRejected(int fieldOffset, int value)
            throws IOException {
        byte[] header = compoundFileHeader();
        writeShort(header, fieldOffset, value);
        byte[] payload =
                concat(
                        header,
                        zip(
                                Map.of(
                                        "content.xml",
                                        ODF_CONTENT_EXTERNAL.getBytes(StandardCharsets.UTF_8))));

        assertThrows(IOException.class, () -> sanitizer.sanitize(payload));
    }

    /** The fixed part of a version-3 compound file header, as LibreOffice requires it. */
    private static byte[] compoundFileHeader() {
        byte[] header = new byte[512];
        System.arraycopy(COMPOUND_FILE_MAGIC, 0, header, 0, COMPOUND_FILE_MAGIC.length);
        writeShort(header, 24, 0x003E);
        writeShort(header, 26, 3);
        writeShort(header, 28, 0xFFFE);
        writeShort(header, 30, 9);
        writeShort(header, 32, 6);
        writeShort(header, 44, 1);
        return header;
    }

    private static byte[] concat(byte[]... parts) {
        int length = 0;
        for (byte[] part : parts) {
            length += part.length;
        }
        byte[] joined = new byte[length];
        int at = 0;
        for (byte[] part : parts) {
            System.arraycopy(part, 0, joined, at, part.length);
            at += part.length;
        }
        return joined;
    }

    private static final String ILLUSTRATOR_SVG =
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n"
                    + "<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\""
                    + " \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\" [\n"
                    + "\t<!ENTITY ns_extend \"http://ns.adobe.com/Extensibility/1.0/\">\n"
                    + "\t<!ENTITY ns_flows \"http://ns.adobe.com/Flows/1.0/\">\n"
                    + "]>\n"
                    + "<svg version=\"1.1\" xmlns:x=\"&ns_extend;\" xmlns:i=\"&ns_flows;\""
                    + " xmlns=\"http://www.w3.org/2000/svg\" width=\"240\" height=\"80\">"
                    + "<rect width=\"240\" height=\"80\" fill=\"#dde\"/>"
                    + "<text x=\"8\" y=\"45\">STIRLINGSENTINEL</text></svg>";

    @Test
    void sanitize_illustratorSvgKeepsItsInternalSubsetAndConverts() throws IOException {
        String out =
                new String(
                        sanitizer.sanitize(ILLUSTRATOR_SVG.getBytes(StandardCharsets.UTF_8)),
                        StandardCharsets.UTF_8);

        assertTrue(out.contains("STIRLINGSENTINEL"), "the document's own content must survive");
        assertFalse(out.contains("svg11.dtd"), "the external identifier must not survive");
        assertTrue(
                out.contains("http://ns.adobe.com/Extensibility/1.0/"),
                "the entity the root element references must still resolve");
    }

    @Test
    void sanitize_svgDoctypeWithNoInternalSubsetStillConverts() throws IOException {
        String svg =
                "<?xml version=\"1.0\"?>"
                        + "<!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 1.1//EN\""
                        + " \"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd\">"
                        + "<svg xmlns=\"http://www.w3.org/2000/svg\"><text>KEEPME</text></svg>";

        String out =
                new String(
                        sanitizer.sanitize(svg.getBytes(StandardCharsets.UTF_8)),
                        StandardCharsets.UTF_8);

        assertTrue(out.contains("KEEPME"));
        assertFalse(out.contains("svg11.dtd"));
    }

    @Test
    void sanitize_doctypeTerminatorInsideALiteralDoesNotTruncateTheDeclaration()
            throws IOException {
        String svg =
                "<?xml version=\"1.0\"?>"
                        + "<!DOCTYPE svg SYSTEM \"http://example.invalid/a>b]c.dtd\" ["
                        + "<!ENTITY quip \"]> not the end\">]>"
                        + "<svg xmlns=\"http://www.w3.org/2000/svg\"><text>&quip;</text></svg>";

        String out =
                new String(
                        sanitizer.sanitize(svg.getBytes(StandardCharsets.UTF_8)),
                        StandardCharsets.UTF_8);

        assertTrue(out.contains("not the end"), "the entity must have resolved");
        assertFalse(out.contains("example.invalid"), "the system literal must not survive");
    }

    @Test
    void sanitize_entityValuedHrefIsStrippedRatherThanFetched() throws IOException {
        String svg =
                "<?xml version=\"1.0\"?>"
                        + "<!DOCTYPE svg [<!ENTITY leak \"http://127.0.0.1:9931/A\">]>"
                        + "<svg xmlns=\"http://www.w3.org/2000/svg\""
                        + " xmlns:xlink=\"http://www.w3.org/1999/xlink\">"
                        + "<image xlink:href=\"&leak;\" width=\"10\" height=\"10\"/></svg>";

        String out =
                new String(
                        sanitizer.sanitize(svg.getBytes(StandardCharsets.UTF_8)),
                        StandardCharsets.UTF_8);

        assertFalse(out.contains("127.0.0.1"), "the expanded entity's url must be stripped");
    }

    @Test
    void sanitize_attlistDefaultedHrefCannotSurviveRemoval() throws IOException {
        String svg =
                "<?xml version=\"1.0\"?>"
                        + "<!DOCTYPE svg ["
                        + "<!ATTLIST image xlink:href CDATA \"http://127.0.0.1:9931/F\">]>"
                        + "<svg xmlns=\"http://www.w3.org/2000/svg\""
                        + " xmlns:xlink=\"http://www.w3.org/1999/xlink\">"
                        + "<image width=\"10\" height=\"10\"/></svg>";

        String out =
                new String(
                        sanitizer.sanitize(svg.getBytes(StandardCharsets.UTF_8)),
                        StandardCharsets.UTF_8);

        assertFalse(
                out.contains("127.0.0.1"),
                "a DTD-defaulted attribute is re-applied on removal and must be overwritten");
    }

    @Test
    void sanitize_externalEntitiesAreNeverResolved() throws IOException {
        String svg =
                "<?xml version=\"1.0\"?>"
                        + "<!DOCTYPE svg [<!ENTITY xxe SYSTEM \"file:///etc/passwd\">]>"
                        + "<svg xmlns=\"http://www.w3.org/2000/svg\"><text>&xxe;</text></svg>";

        String out =
                new String(
                        sanitizer.sanitize(svg.getBytes(StandardCharsets.UTF_8)),
                        StandardCharsets.UTF_8);

        assertFalse(out.contains("root:"), "no file content may reach the output");
        assertFalse(out.contains("/etc/passwd"));
    }

    @Test
    void sanitize_entityExpansionBombIsRefused() {
        StringBuilder subset = new StringBuilder("<!ENTITY a0 \"aaaaaaaaaa\">");
        for (int level = 1; level < 9; level++) {
            subset.append("<!ENTITY a").append(level).append(" \"");
            subset.append(("&a" + (level - 1) + ";").repeat(10));
            subset.append("\">");
        }
        String svg =
                "<?xml version=\"1.0\"?><!DOCTYPE svg ["
                        + subset
                        + "]><svg xmlns=\"http://www.w3.org/2000/svg\"><text>&a8;</text></svg>";

        assertThrows(
                OfficeDocumentSanitizer.UnsanitizableDocumentException.class,
                () -> sanitizer.sanitize(svg.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void sanitize_xmlThatCannotBeParsedAtAllIsRefusedWithAFixedMessage() {
        String svg =
                "<?xml version=\"1.0\"?><!DOCTYPE svg [<!ENTITY ok \"x\">]>"
                        + "<svg xmlns=\"http://www.w3.org/2000/svg\"><rect";

        IOException thrown =
                assertThrows(
                        OfficeDocumentSanitizer.UnsanitizableDocumentException.class,
                        () -> sanitizer.sanitize(svg.getBytes(StandardCharsets.UTF_8)));

        assertFalse(thrown.getMessage().contains("rect"), "the message must not echo the input");
    }

    @Test
    void sanitize_unreadableZipPartIsRefusedWithoutEchoingItsName() throws IOException {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put(
                "REFLECTED<script>ATTACKER</script>/content.xml",
                "<office:document-content".getBytes(StandardCharsets.UTF_8));
        byte[] container = zip(entries);

        IOException thrown =
                assertThrows(
                        OfficeDocumentSanitizer.UnsanitizableDocumentException.class,
                        () -> sanitizer.sanitize(container));

        assertFalse(thrown.getMessage().contains("script"));
    }

    private static void writeShort(byte[] b, int offset, int value) {
        b[offset] = (byte) (value & 0xFF);
        b[offset + 1] = (byte) ((value >>> 8) & 0xFF);
    }

    private static byte[] zip(Map<String, byte[]> entries) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            for (Map.Entry<String, byte[]> e : entries.entrySet()) {
                ZipEntry entry = new ZipEntry(e.getKey());
                zos.putNextEntry(entry);
                zos.write(e.getValue());
                zos.closeEntry();
            }
        }
        return baos.toByteArray();
    }

    private static Map<String, byte[]> unzip(byte[] data) throws IOException {
        Map<String, byte[]> entries = new HashMap<>();
        try (ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(data))) {
            ZipEntry e;
            while ((e = zis.getNextEntry()) != null) {
                entries.put(e.getName(), zis.readAllBytes());
                zis.closeEntry();
            }
        }
        return entries;
    }
}
