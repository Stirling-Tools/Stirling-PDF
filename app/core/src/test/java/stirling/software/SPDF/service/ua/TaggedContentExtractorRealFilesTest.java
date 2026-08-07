package stirling.software.SPDF.service.ua;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import stirling.software.common.pdf.ua.PageContent;
import stirling.software.common.pdf.ua.TaggedContentExtractor;

/**
 * Guards the invariant the tagger rests on: the token pass and text pass must agree on ordinals.
 * They can silently disagree, and the extractor then drops the page rather than mis-tag it.
 */
class TaggedContentExtractorRealFilesTest {

    private static Path repoRoot;

    @BeforeAll
    static void setUp() {
        repoRoot = Path.of("").toAbsolutePath();
        while (repoRoot != null && !Files.exists(repoRoot.resolve("settings.gradle"))) {
            repoRoot = repoRoot.getParent();
        }
    }

    @Test
    @DisplayName("pages with extractable text always yield lines across the repository corpus")
    void ordinalsAgreeOnRealFiles() throws Exception {
        assertNotNull(repoRoot, "could not locate the repository root");
        List<String> dropped = new ArrayList<>();
        int inspected = 0;

        for (Path pdf : findPdfs()) {
            byte[] bytes;
            try {
                bytes = Files.readAllBytes(pdf);
            } catch (Exception e) {
                continue;
            }
            try (PDDocument document = Loader.loadPDF(bytes)) {
                if (document.getNumberOfPages() > 30) {
                    continue;
                }
                inspected++;
                List<PageContent> pages = new TaggedContentExtractor().extract(document);

                for (PageContent page : pages) {
                    if (page.markableCount() == 0 || !hasText(document, page.pageIndex())) {
                        continue;
                    }
                    if (page.lines().isEmpty() && page.forms().isEmpty()) {
                        dropped.add(repoRoot.relativize(pdf) + " page " + page.pageIndex());
                    }
                }
            } catch (Exception e) {
                // Unreadable files are covered by the conversion tests.
            }
        }

        assertTrue(inspected > 15, "expected to inspect a real corpus, saw " + inspected);
        assertTrue(
                dropped.isEmpty(),
                "the two extraction passes disagreed, so these pages were skipped: " + dropped);
    }

    private static boolean hasText(PDDocument document, int pageIndex) {
        try {
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setStartPage(pageIndex + 1);
            stripper.setEndPage(pageIndex + 1);
            return !stripper.getText(document).isBlank();
        } catch (Exception e) {
            return false;
        }
    }

    private List<Path> findPdfs() throws Exception {
        try (Stream<Path> stream = Files.walk(repoRoot)) {
            return stream.filter(Files::isRegularFile)
                    .filter(p -> p.toString().toLowerCase().endsWith(".pdf"))
                    .filter(p -> !p.toString().contains("node_modules"))
                    .filter(p -> !p.toString().contains(java.io.File.separator + "build"))
                    .filter(p -> !p.toString().contains(".git"))
                    .toList();
        }
    }
}
