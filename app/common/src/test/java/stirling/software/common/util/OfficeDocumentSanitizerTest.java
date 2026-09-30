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
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.SsrfProtectionService;

class OfficeDocumentSanitizerTest {

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
    void isSanitizableExtension_recognizesOoxmlAndOdf() {
        assertTrue(sanitizer.isSanitizableExtension("docx"));
        assertTrue(sanitizer.isSanitizableExtension("DOCX"));
        assertTrue(sanitizer.isSanitizableExtension("xlsx"));
        assertTrue(sanitizer.isSanitizableExtension("pptx"));
        assertTrue(sanitizer.isSanitizableExtension("odt"));
        assertTrue(sanitizer.isSanitizableExtension("ods"));
        assertTrue(sanitizer.isSanitizableExtension("odp"));
        assertFalse(sanitizer.isSanitizableExtension("pdf"));
        assertFalse(sanitizer.isSanitizableExtension("html"));
        assertFalse(sanitizer.isSanitizableExtension(""));
        assertFalse(sanitizer.isSanitizableExtension(null));
    }

    @Test
    void sanitize_stripsOoxmlExternalRelationship() throws IOException {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("word/_rels/document.xml.rels", DOCX_RELS.getBytes(StandardCharsets.UTF_8));
        entries.put("word/document.xml", DOCX_DOCUMENT.getBytes(StandardCharsets.UTF_8));
        byte[] docx = zip(entries);

        byte[] cleaned = sanitizer.sanitize(docx, "docx");

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

        byte[] cleaned = sanitizer.sanitize(pptx, "pptx");

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

        byte[] cleaned = sanitizer.sanitize(xlsx, "xlsx");

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

        byte[] cleaned = sanitizer.sanitize(odt, "odt");

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

        byte[] cleaned = sanitizer.sanitize(ods, "ods");

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

        byte[] cleaned = sanitizer.sanitize(odp, "odp");

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

        byte[] result = sanitizer.sanitize(docx, "docx");
        assertArrayEquals(docx, result);
    }

    @Test
    void sanitize_unrecognizedExtensionReturnsOriginal() throws IOException {
        byte[] original = "irrelevant".getBytes(StandardCharsets.UTF_8);
        byte[] result = sanitizer.sanitize(original, "pdf");
        assertArrayEquals(original, result);
    }

    @Test
    void sanitize_emptyInputThrows() {
        assertThrows(IOException.class, () -> sanitizer.sanitize(new byte[0], "docx"));
    }

    @Test
    void sanitize_nullInputThrows() {
        assertThrows(IOException.class, () -> sanitizer.sanitize(null, "docx"));
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

        byte[] cleaned = sanitizer.sanitize(docx, "docx");

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

        byte[] cleaned = sanitizer.sanitize(docx, "docx");

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

        byte[] cleaned = sanitizer.sanitize(docx, "docx");

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

        byte[] cleaned = sanitizer.sanitize(docx, "docx");

        Map<String, byte[]> result = unzip(cleaned);
        String rels =
                new String(result.get("word/_rels/document.xml.rels"), StandardCharsets.UTF_8);
        assertTrue(rels.contains("media/image1.png"));
    }

    @Test
    void sanitize_corruptZipProducesSafeOutput() throws IOException {
        byte[] garbage = "this is not a zip file".getBytes(StandardCharsets.UTF_8);
        byte[] result = sanitizer.sanitize(garbage, "docx");
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

        byte[] cleaned = sanitizer.sanitize(odt, "odt");

        Map<String, byte[]> result = unzip(cleaned);
        String out = new String(result.get("content.xml"), StandardCharsets.UTF_8);
        assertTrue(out.contains("../Pictures/image1.png"));
        assertTrue(out.contains("#anchor"));
    }

    @Test
    void sanitize_refusesADoctypeRatherThanPassingItOnUnchecked() throws IOException {
        String doctype =
                "<?xml version=\"1.0\"?><!DOCTYPE r [<!ENTITY e \""
                        + EXTERNAL_URL
                        + "\">]><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/"
                        + "relationships\"><Relationship Id=\"rId1\" Type=\"t\" Target=\"&e;\""
                        + " TargetMode=\"External\"/></Relationships>";
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("word/_rels/document.xml.rels", doctype.getBytes(StandardCharsets.UTF_8));
        byte[] docx = zip(entries);

        OfficeDocumentSanitizer.DoctypeRefused e =
                assertThrows(
                        OfficeDocumentSanitizer.DoctypeRefused.class,
                        () -> sanitizer.sanitize(docx, "docx"));
        assertTrue(e.getMessage().contains("word/_rels/document.xml.rels"), e.getMessage());
    }

    @Test
    void sanitize_streamsALargeRelationshipsPartThatInflatesFromASmallUpload() throws IOException {
        StringBuilder rels =
                new StringBuilder(
                        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships"
                                + " xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">");
        int count = 0;
        while (rels.length() < 3 * OfficeDocumentSanitizer.IN_MEMORY_XML_BYTES) {
            rels.append("<Relationship Id=\"rId")
                    .append(count++)
                    .append("\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/")
                    .append("relationships/image\" Target=\"media/image1.png\"/>");
        }
        rels.append("<Relationship Id=\"rIdX\" Type=\"t\" Target=\"")
                .append(EXTERNAL_URL)
                .append("\" TargetMode=\"External\"/></Relationships>");
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put(
                "word/_rels/document.xml.rels", rels.toString().getBytes(StandardCharsets.UTF_8));
        entries.put("word/document.xml", DOCX_DOCUMENT.getBytes(StandardCharsets.UTF_8));
        byte[] docx = zip(entries);
        assertTrue(docx.length < rels.length() / 20, "the upload is small: " + docx.length);

        ByteArrayOutputStream cleaned = new ByteArrayOutputStream();
        sanitizer.sanitize(new ByteArrayInputStream(docx), cleaned, "docx");

        Map<String, byte[]> result = unzip(cleaned.toByteArray());
        String out = new String(result.get("word/_rels/document.xml.rels"), StandardCharsets.UTF_8);
        assertFalse(out.contains(EXTERNAL_URL));
        assertTrue(out.contains("Id=\"rId" + (count - 1) + "\""), "every internal one is kept");
        assertArrayEquals(
                DOCX_DOCUMENT.getBytes(StandardCharsets.UTF_8), result.get("word/document.xml"));
    }

    @Test
    void sanitize_streamVariantMatchesTheByteVariantAndLeavesOutputOpen() throws IOException {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("word/_rels/document.xml.rels", DOCX_RELS.getBytes(StandardCharsets.UTF_8));
        entries.put("word/document.xml", DOCX_DOCUMENT.getBytes(StandardCharsets.UTF_8));
        byte[] docx = zip(entries);
        ByteArrayOutputStream streamed = new ByteArrayOutputStream();
        sanitizer.sanitize(new ByteArrayInputStream(docx), streamed, "docx");
        streamed.write(0);

        Map<String, byte[]> a = unzip(sanitizer.sanitize(docx, "docx"));
        Map<String, byte[]> b =
                unzip(java.util.Arrays.copyOf(streamed.toByteArray(), streamed.size() - 1));
        assertArrayEquals(
                a.get("word/_rels/document.xml.rels"), b.get("word/_rels/document.xml.rels"));
        assertThrows(
                IOException.class,
                () ->
                        sanitizer.sanitize(
                                new ByteArrayInputStream(new byte[0]),
                                new ByteArrayOutputStream(),
                                "docx"));
    }

    @Test
    void sanitize_keepsNamespacesAndTextWhenStrippingAnOdfHref() throws IOException {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        String content =
                ODF_CONTENT_EXTERNAL.replace(
                        "<office:body>",
                        "<office:body><text:p xmlns:text=\"t\">A &amp; B</text:p>");
        entries.put("content.xml", content.getBytes(StandardCharsets.UTF_8));
        byte[] cleaned = sanitizer.sanitize(zip(entries), "odt");

        String out = new String(unzip(cleaned).get("content.xml"), StandardCharsets.UTF_8);
        assertFalse(out.contains(EXTERNAL_URL));
        assertTrue(out.contains("xmlns:xlink=\"http://www.w3.org/1999/xlink\""), out);
        assertTrue(out.contains("A &amp; B"), out);
        assertTrue(out.contains("xlink:href=\"Pictures/image1.png\""), out);
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
