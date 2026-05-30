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

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;
import stirling.software.saas.payg.policy.PricingPolicy;

class DefaultDocumentClassifierTest {

    /** Same shape as the V1 default we'd seed in pricing_policy. */
    private static final PricingPolicy DEFAULT_POLICY =
            new PricingPolicy(
                    /* docPagesPerUnit= */ 25,
                    /* docBytesPerUnit= */ 10L * 1024 * 1024,
                    /* minChargeUnits= */ 1,
                    /* fileUnitCap= */ 1000);

    private final DefaultDocumentClassifier classifier =
            new DefaultDocumentClassifier(buildTempFileManager());

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
        // 100 pages, well under 10 MiB → page axis dominates. ceil(100 / 25) = 4 units.
        MultipartFile pdf = pdf("hundred.pdf", 100);

        DocumentMetrics metrics = classifier.classify(pdf, DEFAULT_POLICY);

        assertThat(metrics.pages()).isEqualTo(100);
        assertThat(metrics.docUnits()).isEqualTo(4);
    }

    @Test
    void bytesAxisDominatesWhenFileIsLargeButFewPages() {
        // Use a KiB-scale unit so the test allocation stays small.
        PricingPolicy bytesy = new PricingPolicy(25, 10L * 1024, 1, 1000); // 10 KiB per unit
        // 30 KiB / 10 KiB = 3 units.
        byte[] payload = new byte[30 * 1024];
        MultipartFile blob = new MockMultipartFile("file", "scan.tiff", "image/tiff", payload);

        DocumentMetrics metrics = classifier.classify(blob, bytesy);

        assertThat(metrics.pages()).isZero();
        assertThat(metrics.docUnits()).isEqualTo(3);
        assertThat(metrics.contentType()).isEqualTo("image/tiff");
    }

    @Test
    void singleFileFileUnitCap_clampsExtremelyLargeInputs() {
        PricingPolicy tightCap = new PricingPolicy(25, 10L * 1024, 1, /* fileUnitCap= */ 10);
        // 200 KiB → 20 raw units; per-file cap pins to 10.
        byte[] payload = new byte[200 * 1024];
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

        assertThat(metrics.pages()).isZero();
        assertThat(metrics.docUnits()).isEqualTo(1);
    }

    @Test
    void encryptedPdf_isStillClassifiable() throws Exception {
        byte[] bytes = encryptedPdfBytes(5, "ownerpwd", "userpwd");
        MultipartFile encrypted =
                new MockMultipartFile("file", "secret.pdf", "application/pdf", bytes);

        DocumentMetrics metrics = classifier.classify(encrypted, DEFAULT_POLICY);

        // Page count behaviour on encrypted PDFs varies by reader; the stable property is that
        // the byte axis still produces a charge.
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
        byte[] pdfBytes = pdfBytes(50);
        MultipartFile pdf =
                new MockMultipartFile("file", "report.pdf", "application/octet-stream", pdfBytes);

        DocumentMetrics metrics = classifier.classify(pdf, DEFAULT_POLICY);

        assertThat(metrics.pages()).isEqualTo(50);
    }

    @Test
    void multiFile_aggregatesUnits() throws Exception {
        // Two 50-page PDFs: each is ceil(50/25) = 2 raw units; total = 4. Group cap of 1000 × 2
        // doesn't bind.
        DocumentMetrics metrics =
                classifier.classify(List.of(pdf("a.pdf", 50), pdf("b.pdf", 50)), DEFAULT_POLICY);

        assertThat(metrics.docUnits()).isEqualTo(4);
        assertThat(metrics.pages()).isEqualTo(100);
    }

    @Test
    void multiFile_groupCapBindsOnSumOfRawUnits() {
        // Asymmetric file sizes are required to actually exercise the group cap:
        //   File A:  50 raw units (well over fileUnitCap)
        //   File B:   1 raw unit
        //   Raw sum: 51
        //   Group cap = fileUnitCap (25) × file_count (2) = 50
        //
        // With a buggy per-file clamp inside the loop: (25, 1) → sum 26.
        // With the fixed group cap on the raw sum: min(50, 51) = 50.
        PricingPolicy policy =
                new PricingPolicy(
                        /* docPagesPerUnit= */ 25,
                        /* docBytesPerUnit= */ 1L * 1024, // 1 KiB per unit
                        /* minChargeUnits= */ 1,
                        /* fileUnitCap= */ 25);

        byte[] big = new byte[50 * 1024]; // 50 KiB → 50 raw units
        byte[] small = new byte[1 * 1024]; // 1 KiB → 1 raw unit
        MultipartFile a = new MockMultipartFile("file", "a.bin", "application/octet-stream", big);
        MultipartFile b = new MockMultipartFile("file", "b.bin", "application/octet-stream", small);

        DocumentMetrics metrics = classifier.classify(List.of(a, b), policy);

        assertThat(metrics.docUnits())
                .as(
                        "Group cap should clamp the raw sum (51) to fileUnitCap × fileCount (50)."
                                + " A result of 26 here means per-file clamping has snuck back in"
                                + " and the group cap is dead.")
                .isEqualTo(50);
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

    /**
     * Constructs a real {@link TempFileManager} backed by the OS temp dir. Cheaper and more
     * faithful than mocking — the classifier exercises the actual write+read+delete path the way it
     * would in production.
     */
    private static TempFileManager buildTempFileManager() {
        return new TempFileManager(new TempFileRegistry(), new ApplicationProperties());
    }
}
