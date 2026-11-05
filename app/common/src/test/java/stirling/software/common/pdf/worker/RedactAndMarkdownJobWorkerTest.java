package stirling.software.common.pdf.worker;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.common.pdf.BasicPdfMarkdownExtractor;
import stirling.software.common.pdf.MarkdownBlock;

class RedactAndMarkdownJobWorkerTest {

    @TempDir Path dir;
    private PdfWorkerPool pool;

    @AfterEach
    void tearDown() {
        if (pool != null) {
            pool.destroy();
        }
    }

    private PdfWorkerPool workerPool() {
        pool =
                new PdfWorkerPool(
                        new PdfWorkerPool.Config(
                                1,
                                100,
                                Duration.ofMinutes(5),
                                Duration.ofMinutes(2),
                                PdfWorkerLauncher.command("256m", PdfWorkerMain.class)));
        return pool;
    }

    private Path textPdf(String name, String... pageLines) throws IOException {
        Path path = dir.resolve(name);
        try (PDDocument doc = new PDDocument()) {
            for (String line : pageLines) {
                PDPage page = new PDPage();
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.beginText();
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                    cs.newLineAtOffset(72, 700);
                    cs.showText(line);
                    cs.endText();
                }
            }
            doc.save(path.toFile());
        }
        return path;
    }

    @Test
    void redactsInAWorkerProcess() throws IOException {
        Path in = textPdf("in.pdf", "account SECRET-1 here", "nothing to hide");
        Path out = dir.resolve("out.pdf");

        RedactJob.Result result =
                workerPool()
                        .execute(
                                new RedactJob(
                                        in,
                                        out,
                                        List.of("SECRET-1"),
                                        false,
                                        false,
                                        false,
                                        0xFF000000,
                                        0f,
                                        false));

        assertThat(pool.liveWorkers()).isEqualTo(1);
        assertThat(result.outcome()).isEqualTo(RedactJob.Outcome.REDACTED);
        assertThat(result.totalMatches()).isEqualTo(1);
        try (PDDocument redacted = Loader.loadPDF(out.toFile())) {
            String text = new PDFTextStripper().getText(redacted);
            assertThat(text).doesNotContain("SECRET-1").contains("nothing to hide");
        }
    }

    @Test
    void convertsToMarkdownInAWorkerProcess() throws IOException {
        Path in = textPdf("md.pdf", "First page words", "Second page words");

        MarkdownJob.Result result =
                workerPool().execute(new MarkdownJob(in, new BasicPdfMarkdownExtractor()));

        assertThat(pool.liveWorkers()).isEqualTo(1);
        assertThat(result.pageCount()).isEqualTo(2);
        assertThat(result.blocks())
                .extracting(MarkdownBlock::markdown)
                .anySatisfy(md -> assertThat(md).contains("First page words"))
                .anySatisfy(md -> assertThat(md).contains("Second page words"));
        assertThat(result.blocks()).extracting(MarkdownBlock::pageStart).contains(1, 2);
    }
}
