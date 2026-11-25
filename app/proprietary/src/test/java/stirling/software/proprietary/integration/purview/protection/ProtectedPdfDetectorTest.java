package stirling.software.proprietary.integration.purview.protection;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class ProtectedPdfDetectorTest {

    @ParameterizedTest
    @CsvSource({"true, false", "false, true"})
    void recognisesMicrosoftWrapperWhereverItIsListed(
            boolean listInAssociatedFiles, boolean listInNameTree) throws IOException {
        try (PDDocument document =
                Loader.loadPDF(
                        ProtectedPdfFixtures.wrapper(
                                ProtectedPdfDetector.MICROSOFT_SUBTYPE,
                                listInAssociatedFiles,
                                listInNameTree))) {
            assertThat(ProtectedPdfDetector.isMicrosoftProtected(document)).isTrue();
        }
    }

    @Test
    void reportsOtherVendorsWrapperWithoutClaimingIt() throws IOException {
        try (PDDocument document =
                Loader.loadPDF(ProtectedPdfFixtures.wrapper("AcmeDRM", true, true))) {
            assertThat(ProtectedPdfDetector.encryptedPayloadSubtype(document)).contains("AcmeDRM");
            assertThat(ProtectedPdfDetector.isMicrosoftProtected(document)).isFalse();
        }
    }

    @Test
    void ignoresOrdinaryPdf() throws IOException {
        try (PDDocument document = Loader.loadPDF(ProtectedPdfFixtures.plain())) {
            assertThat(ProtectedPdfDetector.encryptedPayloadSubtype(document)).isEmpty();
        }
    }
}
