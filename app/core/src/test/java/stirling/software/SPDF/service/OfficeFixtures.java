package stirling.software.SPDF.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** Minimal Word documents built in memory for conversion tests. */
public final class OfficeFixtures {

    private OfficeFixtures() {}

    /** A DOCX with one page per text, each page break written as Word does. */
    public static byte[] docx(String... pages) throws IOException {
        return build("", pages);
    }

    /** A DOCX whose body declares a DOCTYPE, which Stirling Office Convert refuses to read. */
    public static byte[] docxWithDoctype(String... pages) throws IOException {
        return build("<!DOCTYPE w:document>", pages);
    }

    private static byte[] build(String doctype, String... pages) throws IOException {
        StringBuilder body = new StringBuilder();
        for (int i = 0; i < pages.length; i++) {
            body.append("<w:p><w:r>");
            if (i > 0) {
                body.append("<w:br w:type=\"page\"/>");
            }
            body.append("<w:t>").append(pages[i]).append("</w:t></w:r></w:p>");
        }
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            put(
                    zip,
                    "[Content_Types].xml",
                    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types"
                            + " xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">"
                            + "<Default Extension=\"rels\""
                            + " ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>"
                            + "<Default Extension=\"xml\" ContentType=\"application/xml\"/>"
                            + "<Override PartName=\"/word/document.xml\""
                            + " ContentType=\"application/vnd.openxmlformats-officedocument"
                            + ".wordprocessingml.document.main+xml\"/></Types>");
            put(
                    zip,
                    "_rels/.rels",
                    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships"
                            + " xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">"
                            + "<Relationship Id=\"rId1\""
                            + " Type=\"http://schemas.openxmlformats.org/officeDocument/2006"
                            + "/relationships/officeDocument\" Target=\"word/document.xml\"/>"
                            + "</Relationships>");
            put(
                    zip,
                    "word/document.xml",
                    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>"
                            + doctype
                            + "<w:document"
                            + " xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\">"
                            + "<w:body>"
                            + body
                            + "</w:body></w:document>");
        }
        return bytes.toByteArray();
    }

    private static void put(ZipOutputStream zip, String name, String xml) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(xml.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }
}
