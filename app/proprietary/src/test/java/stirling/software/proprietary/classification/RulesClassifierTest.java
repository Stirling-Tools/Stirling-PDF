package stirling.software.proprietary.classification;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.ByteArrayOutputStream;
import java.io.IOException;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIf;

import stirling.software.common.service.PdfMetadataService;
import stirling.software.jpdfium.panama.NativeLoader;

/** Runs the real native library, so only where the build bundled it (cargo was available). */
@EnabledIf("libraryBundled")
class RulesClassifierTest {

    private final RulesClassifier classifier = new RulesClassifier();

    static boolean libraryBundled() {
        String resource =
                "tools-core/natives/"
                        + NativeLoader.detectPlatform()
                        + "/"
                        + System.mapLibraryName("stirling_tools_proprietary");
        return RulesClassifierTest.class.getClassLoader().getResource(resource) != null;
    }

    @Test
    void labelsAnInvoiceAndRecordsItInTheMetadata() throws IOException {
        RulesClassifier.Classified classified =
                classifier.classify(
                        pdf(
                                "Invoice",
                                "Invoice number: INV-2024-014",
                                "Bill to: Harbour Cafe Ltd",
                                "Total due: $1,200.00",
                                "Payment terms: Net 30"),
                        "invoice-2024-014.pdf");

        assertThat(classified.verdictJson()).contains("\"labels\":[\"invoice\"");
        try (PDDocument result = Loader.loadPDF(classified.pdf())) {
            assertThat(
                            result.getDocumentInformation()
                                    .getCustomMetadataValue(PdfMetadataService.CLASSIFICATION_KEY))
                    .contains("\"labels\":[\"invoice\"");
        }
    }

    @Test
    void leavesAnUnrecognisableDocumentUnlabelled() throws IOException {
        RulesClassifier.Classified classified =
                classifier.classify(pdf("Lorem ipsum dolor sit amet"), "scan.pdf");

        assertThat(classified.verdictJson()).contains("\"labels\":[]");
    }

    private static byte[] pdf(String... lines) throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.beginText();
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 14);
                content.setLeading(20);
                content.newLineAtOffset(72, 700);
                for (String line : lines) {
                    content.showText(line);
                    content.newLine();
                }
                content.endText();
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }
}
