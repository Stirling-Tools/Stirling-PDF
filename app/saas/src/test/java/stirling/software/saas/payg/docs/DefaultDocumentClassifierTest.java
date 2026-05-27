package stirling.software.saas.payg.docs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.saas.payg.policy.PricingPolicy;

class DefaultDocumentClassifierTest {

    /** Same shape as the V1 default we'd seed in pricing_policy. */
    private static final PricingPolicy DEFAULT_POLICY =
            new PricingPolicy(
                    /* docPagesPerUnit= */ 25,
                    /* docBytesPerUnit= */ 10L * 1024 * 1024,
                    /* minChargeUnits= */ 1,
                    /* fileUnitCap= */ 1000);

    private final DefaultDocumentClassifier classifier = new DefaultDocumentClassifier();

    @Test
    void singlePagePdf_isOneUnit() throws Exception {
        MultipartFile pdf = pdf("one.pdf", 1);

        DocumentMetrics metrics = classifier.classify(pdf, DEFAULT_POLICY);

        assertThat(metrics.pages()).isEqualTo(1);
        assertThat(metrics.docUnits()).isEqualTo(1);
        assertThat(metrics.contentType()).isEqualTo("application/pdf");
    }

    @Test
    void multiPagePdf_chargesByPageAxisWhenBytesAreTiny() throws Exception {
        // 100 pages, well under 10 MiB → page axis dominates.
        // ceil(100 / 25) = 4 units.
        MultipartFile pdf = pdf("hundred.pdf", 100);

        DocumentMetrics metrics = classifier.classify(pdf, DEFAULT_POLICY);

        assertThat(metrics.pages()).isEqualTo(100);
        assertThat(metrics.docUnits()).isEqualTo(4);
    }

    @Test
    void bytesAxisDominatesWhenFileIsLargeButFewPages() {
        // Non-PDF binary blob → page count is 0, only the bytes axis contributes.
        // 30 MiB / 10 MiB = 3 units (ceil-divided).
        byte[] payload = new byte[(int) (30L * 1024 * 1024)];
        MultipartFile blob = new MockMultipartFile("file", "scan.tiff", "image/tiff", payload);

        DocumentMetrics metrics = classifier.classify(blob, DEFAULT_POLICY);

        assertThat(metrics.pages()).isZero();
        assertThat(metrics.docUnits()).isEqualTo(3);
        assertThat(metrics.contentType()).isEqualTo("image/tiff");
    }

    @Test
    void fileUnitCap_clampsExtremelyLargeInputs() {
        PricingPolicy tightCap = new PricingPolicy(25, 10L * 1024 * 1024, 1, /* fileUnitCap= */ 10);
        // 200 MiB blob would otherwise be 20 units — the cap limits to 10.
        byte[] payload = new byte[(int) (200L * 1024 * 1024)];
        MultipartFile blob =
                new MockMultipartFile("file", "huge.bin", "application/octet-stream", payload);

        DocumentMetrics metrics = classifier.classify(blob, tightCap);

        assertThat(metrics.docUnits()).isEqualTo(10);
    }

    @Test
    void emptyFile_chargesTheOneUnitFloor() {
        MultipartFile empty =
                new MockMultipartFile("file", "empty.pdf", "application/pdf", new byte[0]);

        DocumentMetrics metrics = classifier.classify(empty, DEFAULT_POLICY);

        assertThat(metrics.bytes()).isZero();
        assertThat(metrics.docUnits()).isEqualTo(1);
    }

    @Test
    void malformedPdf_fallsBackToBytesOnlyClassification() {
        byte[] junk = "%PDF-not-really-a-pdf-but-claims-to-be".getBytes();
        MultipartFile bad = new MockMultipartFile("file", "broken.pdf", "application/pdf", junk);

        DocumentMetrics metrics = classifier.classify(bad, DEFAULT_POLICY);

        // Page count couldn't be read → pages == 0; bytes are tiny → 1 unit floor.
        assertThat(metrics.pages()).isZero();
        assertThat(metrics.docUnits()).isEqualTo(1);
    }

    @Test
    void encryptedPdf_isStillClassifiable() throws Exception {
        byte[] bytes = encryptedPdfBytes(5, "ownerpwd", "userpwd");
        MultipartFile encrypted =
                new MockMultipartFile("file", "secret.pdf", "application/pdf", bytes);

        DocumentMetrics metrics = classifier.classify(encrypted, DEFAULT_POLICY);

        // We don't supply the password, so PDFBox refuses to read pages — but the byte axis still
        // produces a charge. Pages may be 0 (decrypt failed) or non-zero (PDFBox read the catalog
        // before hitting the encrypted stream); we only assert what's stable: there is a charge.
        assertThat(metrics.docUnits()).isGreaterThanOrEqualTo(1);
        assertThat(metrics.bytes()).isEqualTo(bytes.length);
    }

    @Test
    void nullContentType_defaultsToOctetStream() {
        MultipartFile noType =
                new MockMultipartFile(
                        "file", "unknown.dat", /* contentType= */ null, new byte[100]);

        DocumentMetrics metrics = classifier.classify(noType, DEFAULT_POLICY);

        assertThat(metrics.contentType()).isEqualTo("application/octet-stream");
    }

    @Test
    void pdfDetectedByExtension_whenContentTypeIsGeneric() throws Exception {
        // Some clients upload PDFs with content-type application/octet-stream. Filename suffix
        // is the fallback signal so we still try a page-count read.
        byte[] pdfBytes = pdfBytes(50);
        MultipartFile pdf =
                new MockMultipartFile("file", "report.pdf", "application/octet-stream", pdfBytes);

        DocumentMetrics metrics = classifier.classify(pdf, DEFAULT_POLICY);

        assertThat(metrics.pages()).isEqualTo(50);
    }

    @Test
    void multiFile_aggregatesUnits() throws Exception {
        // Two 50-page PDFs: each is ceil(50/25) = 2 units; total = 4.
        DocumentMetrics metrics =
                classifier.classify(List.of(pdf("a.pdf", 50), pdf("b.pdf", 50)), DEFAULT_POLICY);

        assertThat(metrics.docUnits()).isEqualTo(4);
        assertThat(metrics.pages()).isEqualTo(100);
    }

    @Test
    void multiFile_isCappedByFileUnitCapTimesFileCount() {
        // Cap of 5 per file × 2 files = 10 unit ceiling. Two 200 MiB blobs would otherwise be
        // 20 units each → 40 total; the cap pins it to 10.
        PricingPolicy tight = new PricingPolicy(25, 10L * 1024 * 1024, 1, /* fileUnitCap= */ 5);
        byte[] big = new byte[(int) (200L * 1024 * 1024)];
        MultipartFile a = new MockMultipartFile("file", "a.bin", "application/octet-stream", big);
        MultipartFile b = new MockMultipartFile("file", "b.bin", "application/octet-stream", big);

        DocumentMetrics metrics = classifier.classify(List.of(a, b), tight);

        assertThat(metrics.docUnits()).isEqualTo(10);
    }

    @Test
    void multiFile_emptyListRejected() {
        assertThatThrownBy(() -> classifier.classify(List.of(), DEFAULT_POLICY))
                .isInstanceOf(IllegalArgumentException.class);
    }

    // --- Fixture helpers ------------------------------------------------------------------------

    private static MultipartFile pdf(String name, int pages) throws IOException {
        return new MockMultipartFile("file", name, "application/pdf", pdfBytes(pages));
    }

    private static byte[] pdfBytes(int pages) throws IOException {
        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) {
                doc.addPage(new PDPage());
            }
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static byte[] encryptedPdfBytes(int pages, String ownerPwd, String userPwd)
            throws IOException {
        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) {
                doc.addPage(new PDPage());
            }
            doc.protect(new StandardProtectionPolicy(ownerPwd, userPwd, new AccessPermission()));
            doc.save(baos);
            return baos.toByteArray();
        }
    }
}
