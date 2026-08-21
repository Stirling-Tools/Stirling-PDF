package stirling.software.SPDF.model.api.security;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

// Zero-field subclass of PDFFile - exercised via inherited state.
@DisplayName("PDFVerificationRequest")
class PDFVerificationRequestTest {

    @Test
    @DisplayName("inherited fields round-trip")
    void roundTrip() {
        PDFVerificationRequest req = new PDFVerificationRequest();
        req.setFileId("file-7");
        req.setFileInput(new MockMultipartFile("f", new byte[] {1}));

        assertThat(req.getFileId()).isEqualTo("file-7");
        assertThat(req.getFileInput()).isNotNull();
    }

    @Test
    @DisplayName("equals/hashCode for equal pair via inherited field")
    void equalPair() {
        PDFVerificationRequest a = new PDFVerificationRequest();
        a.setFileId("same");
        PDFVerificationRequest b = new PDFVerificationRequest();
        b.setFileId("same");

        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
    }

    @Test
    @DisplayName("differs by inherited field and vs null/other type")
    void notEqual() {
        PDFVerificationRequest a = new PDFVerificationRequest();
        a.setFileId("a");
        PDFVerificationRequest b = new PDFVerificationRequest();
        b.setFileId("b");

        assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
    }

    @Test
    @DisplayName("toString contains class name")
    void toStringContent() {
        assertThat(new PDFVerificationRequest().toString()).contains("PDFVerificationRequest");
    }
}
