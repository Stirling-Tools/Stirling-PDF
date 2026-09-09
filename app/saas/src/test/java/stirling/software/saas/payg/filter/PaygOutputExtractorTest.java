package stirling.software.saas.payg.filter;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;

class PaygOutputExtractorTest {

    private final TempFileManager tempFileManager =
            new TempFileManager(new TempFileRegistry(), new ApplicationProperties());
    private final PaygOutputExtractor extractor = new PaygOutputExtractor(tempFileManager);

    @Test
    void pdfContentType_returnsBodyPathVerbatim(@TempDir Path tmp) throws IOException {
        Path body = tmp.resolve("body.pdf");
        Files.write(body, pdfBytes("hello"));
        List<PaygOutputExtractor.ExtractedPdf> out = extractor.extract("application/pdf", body);
        assertThat(out).hasSize(1);
        assertThat(out.get(0).path()).isEqualTo(body);
        assertThat(out.get(0).ownedTempFile()).isNull();
    }

    @Test
    void pdfContentType_withParameters_stillMatches(@TempDir Path tmp) throws IOException {
        Path body = tmp.resolve("body.pdf");
        Files.write(body, pdfBytes("x"));
        List<PaygOutputExtractor.ExtractedPdf> out =
                extractor.extract("application/pdf; charset=binary", body);
        assertThat(out).hasSize(1);
    }

    @Test
    void pdfContentType_butBodyMissingPdfMagic_returnsEmpty(@TempDir Path tmp) throws IOException {
        // Tool sets application/pdf but writes a non-PDF payload — we should NOT record it as
        // OUTPUT lineage. Mirrors the magic-byte gate already enforced on the ZIP branch.
        Path body = tmp.resolve("misleading.pdf");
        Files.write(body, "this is not actually a pdf".getBytes(StandardCharsets.UTF_8));
        assertThat(extractor.extract("application/pdf", body)).isEmpty();
    }

    @Test
    void zipContentType_extractsOnlyPdfEntriesWithValidMagicBytes(@TempDir Path tmp)
            throws IOException {
        Path zip = tmp.resolve("out.zip");
        try (ZipOutputStream zos = new ZipOutputStream(Files.newOutputStream(zip))) {
            writeEntry(zos, "doc1.pdf", pdfBytes("one"));
            writeEntry(zos, "doc2.pdf", pdfBytes("two"));
            writeEntry(zos, "fake.pdf", "not a pdf at all".getBytes(StandardCharsets.UTF_8));
            writeEntry(zos, "notes.txt", "ignored".getBytes(StandardCharsets.UTF_8));
        }

        List<PaygOutputExtractor.ExtractedPdf> out = extractor.extract("application/zip", zip);
        try {
            assertThat(out).hasSize(2);
            for (PaygOutputExtractor.ExtractedPdf p : out) {
                byte[] head = new byte[5];
                Files.newInputStream(p.path()).read(head);
                assertThat(head).startsWith("%PDF-".getBytes(StandardCharsets.UTF_8));
                assertThat(p.ownedTempFile()).isNotNull();
            }
        } finally {
            for (PaygOutputExtractor.ExtractedPdf p : out) {
                p.close();
            }
        }
    }

    @Test
    void nonPdfNonZipContentType_returnsEmpty(@TempDir Path tmp) throws IOException {
        Path body = tmp.resolve("body.json");
        Files.writeString(body, "{\"error\":\"bad request\"}");
        assertThat(extractor.extract("application/json", body)).isEmpty();
        assertThat(extractor.extract("text/plain", body)).isEmpty();
        assertThat(extractor.extract(null, body)).isEmpty();
    }

    @Test
    void nullBodyPath_returnsEmpty() {
        assertThat(extractor.extract("application/pdf", null)).isEmpty();
    }

    @Test
    void corruptZip_failsClosedAndReturnsEmpty(@TempDir Path tmp) throws IOException {
        Path corrupt = tmp.resolve("garbage.zip");
        Files.write(corrupt, "not a zip file at all".getBytes(StandardCharsets.UTF_8));
        // Should NOT throw — fail-open: empty list, response still serves normally.
        List<PaygOutputExtractor.ExtractedPdf> out = extractor.extract("application/zip", corrupt);
        assertThat(out).isEmpty();
    }

    @Test
    void zipContentType_emptyZip_returnsEmpty(@TempDir Path tmp) throws IOException {
        Path zip = tmp.resolve("empty.zip");
        try (ZipOutputStream zos = new ZipOutputStream(Files.newOutputStream(zip))) {
            // no entries
        }
        assertThat(extractor.extract("application/zip", zip)).isEmpty();
    }

    @Test
    void octetStreamWithPdfMagic_treatedAsPdf(@TempDir Path tmp) throws IOException {
        // Stirling tool endpoints sometimes set Content-Type to
        // application/octet-stream for streamed responses even when the body
        // is a real PDF. The extractor must sniff magic bytes when the
        // declared Content-Type is generic.
        Path body = tmp.resolve("body.bin");
        Files.write(body, pdfBytes("real-pdf-content"));
        List<PaygOutputExtractor.ExtractedPdf> out =
                extractor.extract("application/octet-stream", body);
        assertThat(out).hasSize(1);
        assertThat(out.get(0).path()).isEqualTo(body);
    }

    @Test
    void octetStreamWithZipMagic_unpackedAsZip(@TempDir Path tmp) throws IOException {
        Path zip = tmp.resolve("body.bin");
        try (ZipOutputStream zos = new ZipOutputStream(Files.newOutputStream(zip))) {
            writeEntry(zos, "page1.pdf", pdfBytes("a"));
            writeEntry(zos, "page2.pdf", pdfBytes("b"));
        }
        List<PaygOutputExtractor.ExtractedPdf> out =
                extractor.extract("application/octet-stream", zip);
        try {
            assertThat(out).hasSize(2);
        } finally {
            for (PaygOutputExtractor.ExtractedPdf p : out) {
                p.close();
            }
        }
    }

    @Test
    void nullContentTypeWithZipMagic_unpackedAsZip(@TempDir Path tmp) throws IOException {
        Path zip = tmp.resolve("body.bin");
        try (ZipOutputStream zos = new ZipOutputStream(Files.newOutputStream(zip))) {
            writeEntry(zos, "page1.pdf", pdfBytes("a"));
        }
        List<PaygOutputExtractor.ExtractedPdf> out = extractor.extract(null, zip);
        try {
            assertThat(out).hasSize(1);
        } finally {
            for (PaygOutputExtractor.ExtractedPdf p : out) {
                p.close();
            }
        }
    }

    @Test
    void octetStreamWithoutMagic_returnsEmpty(@TempDir Path tmp) throws IOException {
        Path body = tmp.resolve("body.bin");
        Files.write(body, "neither pdf nor zip".getBytes(StandardCharsets.UTF_8));
        assertThat(extractor.extract("application/octet-stream", body)).isEmpty();
    }

    private static void writeEntry(ZipOutputStream zos, String name, byte[] data)
            throws IOException {
        zos.putNextEntry(new ZipEntry(name));
        zos.write(data);
        zos.closeEntry();
    }

    private static byte[] pdfBytes(String payload) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        // Minimal "looks like a PDF" — just the magic-byte prefix + filler. The extractor only
        // checks magic bytes, not full PDF validity.
        out.write("%PDF-1.4\n".getBytes(StandardCharsets.UTF_8));
        out.write(payload.getBytes(StandardCharsets.UTF_8));
        return out.toByteArray();
    }
}
