package stirling.software.common.pdf.worker;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Runs real merges through real worker processes with the PDFium natives. */
class MergeJobWorkerTest {

    @TempDir Path dir;
    private PdfWorkerPool pool;

    @AfterEach
    void tearDown() {
        if (pool != null) {
            pool.destroy();
        }
    }

    private PdfWorkerPool workerPool() throws IOException {
        pool =
                new PdfWorkerPool(
                        new PdfWorkerPool.Config(
                                2,
                                100,
                                Duration.ofMinutes(5),
                                Duration.ofMinutes(2),
                                PdfWorkerLauncher.command("256m", PdfWorkerMain.class)));
        return pool;
    }

    private Path pdf(String name, int pages) throws IOException {
        Path path = dir.resolve(name);
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < pages; i++) {
                doc.addPage(new PDPage());
            }
            doc.save(path.toFile());
        }
        return path;
    }

    @Test
    void mergesInAWorkerProcessWithTableOfContents() throws IOException {
        Path out = dir.resolve("out.pdf");
        MergeJob.Result result =
                workerPool()
                        .execute(
                                new MergeJob(
                                        List.of(pdf("a.pdf", 2), pdf("b.pdf", 3)),
                                        out,
                                        List.of("First", "Second"),
                                        true));

        assertThat(pool.liveWorkers()).isEqualTo(1);
        assertThat(result.pageCounts()).containsExactly(2, 3);
        assertThat(result.hasSignatures()).isFalse();
        try (PDDocument merged = Loader.loadPDF(out.toFile())) {
            assertThat(merged.getNumberOfPages()).isEqualTo(5);
            assertThat(merged.getDocumentCatalog().getDocumentOutline().getFirstChild().getTitle())
                    .isEqualTo("First");
        }
    }

    @Test
    void corruptInputFailsTheJobButKeepsTheWorker() throws IOException {
        Path bad = dir.resolve("bad.pdf");
        Files.writeString(bad, "not a pdf");
        workerPool();

        assertThatThrownBy(
                        () ->
                                pool.execute(
                                        new MergeJob(
                                                List.of(bad), dir.resolve("x.pdf"), null, false)))
                .isInstanceOf(PdfWorkerJobException.class)
                .hasMessageContaining("JPDFium merge failed");

        MergeJob.Result ok =
                pool.execute(
                        new MergeJob(List.of(pdf("c.pdf", 1)), dir.resolve("y.pdf"), null, false));
        assertThat(ok.pageCounts()).containsExactly(1);
        assertThat(pool.liveWorkers()).isEqualTo(1);
    }
}
