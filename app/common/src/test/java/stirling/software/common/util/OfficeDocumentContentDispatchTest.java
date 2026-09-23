package stirling.software.common.util;

import static java.nio.charset.StandardCharsets.UTF_16BE;
import static java.nio.charset.StandardCharsets.UTF_16LE;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.SsrfProtectionService;

class OfficeDocumentContentDispatchTest {

    private static final String BOM = String.valueOf((char) 0xFEFF);

    private OfficeDocumentSanitizer sanitizer;

    @BeforeEach
    void setUp() {
        SsrfProtectionService ssrf = mock(SsrfProtectionService.class);
        ApplicationProperties properties = new ApplicationProperties();
        lenient()
                .when(ssrf.isUrlAllowed(org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(false);
        sanitizer = new OfficeDocumentSanitizer(ssrf, properties, new RtfSanitizer());
    }

    @Test
    void detectsFamilyFromContentNotExtension() {
        assertEquals(OfficeDocumentFamily.RTF, OfficeDocumentFamily.detect(rtfWithInclude()));
        assertEquals(OfficeDocumentFamily.ZIP_PACKAGE, OfficeDocumentFamily.detect(zipPackage()));
        assertEquals(OfficeDocumentFamily.FLAT_XML, OfficeDocumentFamily.detect(flatOdf()));
        assertEquals(
                OfficeDocumentFamily.PDF,
                OfficeDocumentFamily.detect("%PDF-1.7\n".getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    void rtfRenamedAsDocxIsStillSanitizedAsRtf() throws IOException {
        byte[] cleaned = sanitizer.sanitize(rtfWithInclude(), "docx");
        String text = new String(cleaned, StandardCharsets.UTF_8);

        assertFalse(text.contains("INCLUDEPICTURE"), "RTF field keyword must be neutralised");
        assertTrue(text.contains("Hello"), "Document body must survive");
    }

    @Test
    void flatOdfRenamedAsTxtIsStillSanitized() throws IOException {
        byte[] cleaned = sanitizer.sanitize(flatOdf(), "txt");
        String text = new String(cleaned, StandardCharsets.UTF_8);

        assertFalse(text.contains("/configs/settings.yml"), "Absolute local href must be stripped");
    }

    @Test
    void utf16FlatOdfIsDetectedAndSanitized() throws IOException {
        String odf = new String(flatOdf(), StandardCharsets.UTF_8);
        byte[] withBom = (BOM + odf.replace("UTF-8", "UTF-16")).getBytes(UTF_16LE);
        byte[] withoutBom = odf.replace("UTF-8", "UTF-16").getBytes(UTF_16BE);

        for (byte[] input : List.of(withBom, withoutBom)) {
            assertEquals(OfficeDocumentFamily.FLAT_XML, OfficeDocumentFamily.detect(input));

            String text = decodeXml(sanitizer.sanitize(input, "fodt"));

            assertFalse(text.contains("/configs/settings.yml"), "UTF-16 href must be stripped");
            assertTrue(text.contains("office:document"), "Document must survive");
        }
    }

    @Test
    void utf16FlatXmlBehindAPlainDoctypeIsSanitizedAndMalformedOneRefused() throws IOException {
        String withDoctype =
                BOM
                        + "<?xml version=\"1.0\" encoding=\"UTF-16\"?>"
                        + "<!DOCTYPE office:document PUBLIC \"-//OpenOffice.org//DTD OfficeDocument"
                        + " 1.0//EN\" \"office.dtd\"><office:document"
                        + " xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\""
                        + " xmlns:draw=\"urn:oasis:names:tc:opendocument:xmlns:drawing:1.0\""
                        + " xmlns:xlink=\"http://www.w3.org/1999/xlink\">"
                        + "<draw:image xlink:href='https://attacker.example/x.png'/>"
                        + "</office:document>";
        String malformed = withDoctype.replace("</office:document>", "");

        String text = decodeXml(sanitizer.sanitize(withDoctype.getBytes(UTF_16LE), "fodt"));

        assertFalse(text.contains("attacker.example"), text);
        assertFalse(text.contains("DOCTYPE"), text);
        assertThrows(
                IOException.class, () -> sanitizer.sanitize(malformed.getBytes(UTF_16LE), "fodt"));
    }

    @Test
    void utf16HtmlIsDetectedAndDecodedWithoutItsBom() {
        byte[] html =
                (BOM + "<html><body><h1>Quarterly report</h1></body></html>").getBytes(UTF_16LE);

        assertEquals(OfficeDocumentFamily.HTML, OfficeDocumentFamily.detect(html));
        assertEquals(
                "<html><body><h1>Quarterly report</h1></body></html>",
                OfficeDocumentFamily.decodeText(html));
    }

    @Test
    void rtfSanitizerPreservesBinaryPayloads() {
        byte[] payload = {(byte) 0x49, (byte) 0x4E, (byte) 0x43, (byte) 0x4C};
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(
                "{\\rtf1\\ansi{\\*\\shppict{\\pict\\bin4 ".getBytes(StandardCharsets.US_ASCII));
        out.writeBytes(payload);
        out.writeBytes("}}}".getBytes(StandardCharsets.US_ASCII));
        byte[] input = out.toByteArray();

        byte[] cleaned = new RtfSanitizer().sanitize(input);

        int offset = input.length - payload.length - 3;
        for (int i = 0; i < payload.length; i++) {
            assertEquals(payload[i], cleaned[offset + i], "Binary payload byte " + i + " changed");
        }
    }

    @Test
    void rtfSanitizerMasksLinkFields() {
        byte[] cleaned = new RtfSanitizer().sanitize(rtfWithInclude());
        String text = new String(cleaned, StandardCharsets.UTF_8);

        assertFalse(text.contains("INCLUDEPICTURE"));
        assertEquals(rtfWithInclude().length, cleaned.length, "Masking must preserve length");
    }

    private static String decodeXml(byte[] bytes) {
        return new String(bytes, OfficeDocumentFamily.textCharset(bytes));
    }

    private static byte[] rtfWithInclude() {
        return ("{\\rtf1\\ansi Hello {\\field{\\*\\fldinst { INCLUDEPICTURE "
                        + "\"/configs/settings.yml\" \\\\d }}{\\fldrslt}}}")
                .getBytes(StandardCharsets.US_ASCII);
    }

    private static byte[] flatOdf() {
        return ("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                        + "<office:document"
                        + " xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\""
                        + " xmlns:draw=\"urn:oasis:names:tc:opendocument:xmlns:drawing:1.0\""
                        + " xmlns:xlink=\"http://www.w3.org/1999/xlink\">"
                        + "<draw:image xlink:href=\"/configs/settings.yml\"/>"
                        + "</office:document>")
                .getBytes(StandardCharsets.UTF_8);
    }

    private static byte[] zipPackage() {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("content.xml", "<a/>".getBytes(StandardCharsets.UTF_8));
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            for (Map.Entry<String, byte[]> entry : entries.entrySet()) {
                zos.putNextEntry(new ZipEntry(entry.getKey()));
                zos.write(entry.getValue());
                zos.closeEntry();
            }
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
        return baos.toByteArray();
    }
}
