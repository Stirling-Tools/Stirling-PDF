package stirling.software.SPDF.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDMetadata;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.model.api.security.PDFVerificationResult;
import stirling.software.common.util.XmpUtils;

class VeraPDFServiceXmpLimitTest {

    /** An XMP packet with {@code padding} bytes of whitespace, as packets carry for editing. */
    private static byte[] packet(int padding) {
        String xmp =
                "<?xpacket begin=\"\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>"
                        + "<x:xmpmeta xmlns:x=\"adobe:ns:meta/\"></x:xmpmeta>"
                        + " ".repeat(padding)
                        + "<?xpacket end=\"w\"?>";
        return xmp.getBytes(StandardCharsets.UTF_8);
    }

    private static PDMetadata metadata(PDDocument document, int padding) throws IOException {
        PDMetadata metadata = new PDMetadata(document);
        metadata.importXMPMetadata(packet(padding));
        return metadata;
    }

    private static byte[] save(PDDocument document) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        document.save(out);
        return out.toByteArray();
    }

    @Test
    void oversizedCatalogPacketIsNotValidated() throws Exception {
        byte[] pdf;
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage());
            document.getDocumentCatalog().setMetadata(metadata(document, XmpUtils.MAX_XMP_BYTES));
            pdf = save(document);
        }

        List<PDFVerificationResult> results =
                new VeraPDFService().validatePDF(new ByteArrayInputStream(pdf));

        assertThat(results).hasSize(1);
        assertThat(results.getFirst().isCompliant()).isFalse();
        assertThat(results.getFirst().getFailures())
                .extracting(PDFVerificationResult.ValidationIssue::getMessage)
                .singleElement()
                .asString()
                .startsWith("Not validated");
    }

    @Test
    void oversizedPagePacketIsFound() throws Exception {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage();
            document.addPage(page);
            page.setMetadata(metadata(document, XmpUtils.MAX_XMP_BYTES));

            assertThat(VeraPDFService.hasOversizedXmp(save(document))).isTrue();
        }
    }

    @Test
    void ordinaryPacketsPass() throws Exception {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage();
            document.addPage(page);
            document.getDocumentCatalog().setMetadata(metadata(document, 2_000));
            page.setMetadata(metadata(document, 2_000));

            assertThat(VeraPDFService.hasOversizedXmp(save(document))).isFalse();
        }
    }
}
