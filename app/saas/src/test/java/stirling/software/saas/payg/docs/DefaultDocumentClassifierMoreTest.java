package stirling.software.saas.payg.docs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.TempFileRegistry;
import stirling.software.saas.payg.policy.PricingPolicy;

/**
 * Branch top-up for {@link DefaultDocumentClassifier}: the already-materialised-path read paths
 * (single + multi) and the {@code materialisedPaths} size-mismatch guard, which the existing {@code
 * DefaultDocumentClassifierTest} does not cover.
 */
class DefaultDocumentClassifierMoreTest {

    private static final PricingPolicy DEFAULT_POLICY =
            new PricingPolicy(25, 10L * 1024 * 1024, 1, 1000);

    private final DefaultDocumentClassifier classifier =
            new DefaultDocumentClassifier(
                    new TempFileManager(new TempFileRegistry(), new ApplicationProperties()));

    @Test
    @DisplayName("single file: reads the page count from the already-materialised path")
    void singleFile_readsFromMaterialisedPath(@TempDir Path dir) throws IOException {
        byte[] bytes = pdfBytes(60);
        Path onDisk = dir.resolve("report.pdf");
        Files.write(onDisk, bytes);
        MultipartFile pdf = new MockMultipartFile("file", "report.pdf", "application/pdf", bytes);

        DocumentMetrics metrics = classifier.classify(pdf, onDisk, DEFAULT_POLICY);

        // ceil(60 / 25) = 3 page-units; bytes are tiny so the page axis wins.
        assertThat(metrics.pages()).isEqualTo(60);
        assertThat(metrics.docUnits()).isEqualTo(3);
        assertThat(metrics.contentType()).isEqualTo("application/pdf");
    }

    @Test
    @DisplayName("single file: malformed materialised PDF falls back to bytes-only")
    void singleFile_malformedMaterialisedPath_bytesOnly(@TempDir Path dir) throws IOException {
        byte[] junk = "%PDF-broken".getBytes();
        Path onDisk = dir.resolve("broken.pdf");
        Files.write(onDisk, junk);
        MultipartFile pdf = new MockMultipartFile("file", "broken.pdf", "application/pdf", junk);

        DocumentMetrics metrics = classifier.classify(pdf, onDisk, DEFAULT_POLICY);

        assertThat(metrics.pages()).isZero();
        assertThat(metrics.docUnits()).isEqualTo(1); // floor
    }

    @Test
    @DisplayName("multi-file: reads each page count from the supplied materialised paths")
    void multiFile_readsFromMaterialisedPaths(@TempDir Path dir) throws IOException {
        byte[] a = pdfBytes(50);
        byte[] b = pdfBytes(50);
        Path pa = dir.resolve("a.pdf");
        Path pb = dir.resolve("b.pdf");
        Files.write(pa, a);
        Files.write(pb, b);
        MultipartFile fa = new MockMultipartFile("file", "a.pdf", "application/pdf", a);
        MultipartFile fb = new MockMultipartFile("file", "b.pdf", "application/pdf", b);

        DocumentMetrics metrics =
                classifier.classify(List.of(fa, fb), List.of(pa, pb), DEFAULT_POLICY);

        // Each ceil(50/25)=2 → sum 4; group cap 1000×2 doesn't bind.
        assertThat(metrics.pages()).isEqualTo(100);
        assertThat(metrics.docUnits()).isEqualTo(4);
    }

    @Test
    @DisplayName("multi-file: null materialisedPaths is allowed and reads from the multiparts")
    void multiFile_nullMaterialisedPaths_readsFromMultipart() throws IOException {
        MultipartFile fa = new MockMultipartFile("file", "a.pdf", "application/pdf", pdfBytes(25));
        MultipartFile fb = new MockMultipartFile("file", "b.pdf", "application/pdf", pdfBytes(25));

        DocumentMetrics metrics = classifier.classify(List.of(fa, fb), null, DEFAULT_POLICY);

        assertThat(metrics.pages()).isEqualTo(50);
        assertThat(metrics.docUnits()).isEqualTo(2);
    }

    @Test
    @DisplayName("multi-file: a materialisedPaths size mismatch is rejected")
    void multiFile_sizeMismatchRejected(@TempDir Path dir) throws IOException {
        MultipartFile fa = new MockMultipartFile("file", "a.pdf", "application/pdf", pdfBytes(1));
        MultipartFile fb = new MockMultipartFile("file", "b.pdf", "application/pdf", pdfBytes(1));
        Path pa = dir.resolve("a.pdf");
        Files.write(pa, pdfBytes(1));

        assertThatThrownBy(() -> classifier.classify(List.of(fa, fb), List.of(pa), DEFAULT_POLICY))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("materialisedPaths size");
    }

    @Test
    @DisplayName("classify(file, null, policy) overload falls through to the multipart read")
    void singleFile_nullPathOverload() throws IOException {
        MultipartFile pdf = new MockMultipartFile("file", "x.pdf", "application/pdf", pdfBytes(30));

        DocumentMetrics metrics = classifier.classify(pdf, null, DEFAULT_POLICY);

        assertThat(metrics.pages()).isEqualTo(30);
        assertThat(metrics.docUnits()).isEqualTo(2); // ceil(30/25)
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
}
