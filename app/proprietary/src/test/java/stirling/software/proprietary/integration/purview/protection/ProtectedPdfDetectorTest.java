package stirling.software.proprietary.integration.purview.protection;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.Test;

class ProtectedPdfDetectorTest {

    @Test
    void recognisesMicrosoftWrapperListedAsAssociatedFile() throws IOException {
        try (PDDocument document =
                Loader.loadPDF(ProtectedPdfFixtures.wrapper("MicrosoftIRMServices", true, false))) {
            assertThat(ProtectedPdfDetector.isMicrosoftProtected(document)).isTrue();
        }
    }

    @Test
    void recognisesMicrosoftWrapperListedOnlyInNameTree() throws IOException {
        try (PDDocument document =
                Loader.loadPDF(ProtectedPdfFixtures.wrapper("MicrosoftIRMServices", false, true))) {
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
