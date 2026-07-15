package stirling.software.proprietary.classification;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.Test;

import stirling.software.proprietary.classification.HeuristicClassifier.HeuristicResult;

/**
 * End-to-end (minus HTTP) test of the real server-side path: real PDF bytes -> PDFBox extraction
 * ({@link HeuristicDocExtractor}) -> scoring ({@link HeuristicClassifier}). Confirms the backend
 * reproduces the labels the frontend produced for the same documents.
 */
class HeuristicDocExtractorTest {

    private static final HeuristicDocExtractor EXTRACTOR = new HeuristicDocExtractor();
    private static final HeuristicClassifier CLASSIFIER = new HeuristicClassifier();

    private HeuristicResult classifyResource(String name) throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/classification/" + name)) {
            assertThat(in).as("test fixture %s", name).isNotNull();
            byte[] bytes = in.readAllBytes();
            try (PDDocument document = Loader.loadPDF(bytes)) {
                return CLASSIFIER.classify(EXTRACTOR.extract(document, name));
            }
        }
    }

    @Test
    void realInvoicePdfClassifiesAsInvoice() throws Exception {
        HeuristicResult r = classifyResource("invoice_acme_2024.pdf");
        assertThat(r.labels()).isNotEmpty();
        assertThat(r.labels().get(0)).isEqualTo("invoice");
    }

    @Test
    void realResearchPaperPdfClassifiesAsResearchPaper() throws Exception {
        HeuristicResult r = classifyResource("research_paper_attention.pdf");
        assertThat(r.labels()).contains("research-paper");
    }

    @Test
    void realBoardingPassPdfClassifiesAsTicket() throws Exception {
        HeuristicResult r = classifyResource("boarding_pass_BA117.pdf");
        assertThat(r.labels()).isNotEmpty();
        assertThat(r.labels().get(0)).isEqualTo("ticket");
    }

    @Test
    void imageOnlyScanClassifiesByFilename() throws Exception {
        // No text layer (the backend doesn't OCR), but the filename still carries the signal -
        // mirrors the frontend's "filename-only evidence on a text-empty doc is fine".
        HeuristicResult r = classifyResource("scanned_invoice.pdf");
        assertThat(r.labels()).contains("invoice");
    }
}
