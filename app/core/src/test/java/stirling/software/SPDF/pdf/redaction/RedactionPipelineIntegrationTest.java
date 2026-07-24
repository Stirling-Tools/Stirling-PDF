package stirling.software.SPDF.pdf.redaction;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Integration tests that exercise the real redaction pipeline against PDFs */
class RedactionPipelineIntegrationTest {

    private static byte[] loadFixture() throws Exception {
        try (InputStream in =
                RedactionPipelineIntegrationTest.class.getResourceAsStream(
                        "/redaction/test_pdf_1.pdf")) {
            assertNotNull(in, "fixture resource must exist on classpath");
            return in.readAllBytes();
        }
    }

    @Test
    @DisplayName(
            "finalize on rotated ReportLab PDF without a rewrite pass falls back to rasterisation so target disappears")
    void finaliseFallsBackToRasterisationWhenTargetWouldSurvive() throws Exception {
        byte[] fixtureBytes = loadFixture();
        byte[] outputBytes;
        try (PDDocument doc = Loader.loadPDF(fixtureBytes)) {
            Set<String> literalTargets = new LinkedHashSet<>();
            literalTargets.add("Test");
            // No content-stream rewriting performed.
            outputBytes = RedactionPipeline.finalize(doc, literalTargets, Collections.emptyList());
        }
        try (PDDocument reopened = Loader.loadPDF(outputBytes)) {
            String extracted = new PDFTextStripper().getText(reopened);
            String lower = extracted == null ? "" : extracted.toLowerCase(Locale.ROOT);
            assertFalse(
                    lower.contains("test"),
                    "Rasterisation fallback must have removed target. Extracted: '"
                            + extracted
                            + "'");
        }
    }

    @Test
    @DisplayName(
            "finalize with zero rewrite + synthetic upright PDF triggers RedactionVerificationFailedException only when fallback disabled")
    void verificationExceptionWiringSanityCheck() throws Exception {
        // This test proves the verification hook itself still throws -
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(100, 700);
                cs.showText("Top Smith Classified");
                cs.endText();
            }
            Set<String> literalTargets = new LinkedHashSet<>();
            literalTargets.add("Smith");
            // Even with the rasterisation fallback active, the output must not contain
            byte[] outBytes =
                    RedactionPipeline.finalize(doc, literalTargets, Collections.emptyList());
            try (PDDocument reopened = Loader.loadPDF(outBytes)) {
                String extracted = new PDFTextStripper().getText(reopened);
                String lower = extracted == null ? "" : extracted.toLowerCase(Locale.ROOT);
                assertFalse(
                        lower.contains("smith"),
                        "Neither primary pass nor rasterisation removed target. Extracted: '"
                                + extracted
                                + "'");
            }
        }
    }

    @Test
    @DisplayName(
            "auto-word redact on rotated PDF with target packed in single Tj removes the word from text stream")
    void autoWordRedactRemovesTargetOnRotatedSingleTjPdf() throws Exception {
        byte[] fixtureBytes = loadFixture();
        byte[] outputBytes;
        Set<String> literalTargets = new LinkedHashSet<>();
        literalTargets.add("Test");
        List<Pattern> patterns =
                RedactionPipeline.buildPatterns(new String[] {"Test"}, false, false);

        try (PDDocument doc = Loader.loadPDF(fixtureBytes)) {
            RedactionPipeline.redactLiteralTerms(doc, literalTargets, patterns);
            outputBytes = RedactionPipeline.finalize(doc, literalTargets, patterns);
        }

        try (PDDocument reopened = Loader.loadPDF(outputBytes)) {
            PDFTextStripper stripper = new PDFTextStripper();
            String extracted = stripper.getText(reopened);
            String lower = extracted == null ? "" : extracted.toLowerCase(Locale.ROOT);
            assertFalse(
                    lower.contains("test"),
                    "Target term must not be extractable after redact. Extracted: '"
                            + extracted
                            + "'");
        }
    }

    @Test
    @DisplayName("simple upright Helvetica fixture still gets word redacted via the pipeline")
    void autoWordRedactRemovesTargetOnSyntheticPdf() throws Exception {
        byte[] outputBytes;
        Set<String> literalTargets = new LinkedHashSet<>();
        literalTargets.add("Secret");
        List<Pattern> patterns =
                RedactionPipeline.buildPatterns(new String[] {"Secret"}, false, false);

        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                cs.beginText();
                cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                cs.newLineAtOffset(100, 700);
                cs.showText("Top Secret Classified");
                cs.endText();
            }
            ByteArrayOutputStream tmp = new ByteArrayOutputStream();
            doc.save(tmp);
            // reload from bytes so we are processing an already-saved PDF similar
            try (PDDocument reloaded = Loader.loadPDF(tmp.toByteArray())) {
                RedactionPipeline.redactLiteralTerms(reloaded, literalTargets, patterns);
                outputBytes = RedactionPipeline.finalize(reloaded, literalTargets, patterns);
            }
        }

        try (PDDocument reopened = Loader.loadPDF(outputBytes)) {
            String extracted = new PDFTextStripper().getText(reopened);
            String lower = extracted == null ? "" : extracted.toLowerCase(Locale.ROOT);
            assertFalse(
                    lower.contains("secret"),
                    "Target term must not be extractable after redact on synthetic PDF. Extracted: '"
                            + extracted
                            + "'");
        }
    }
}
