package stirling.software.SPDF.model.api.security;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

@DisplayName("PDFPasswordRequest")
class PDFPasswordRequestTest {

    @Test
    @DisplayName("password and inherited fields round-trip")
    void roundTrip() {
        PDFPasswordRequest req = new PDFPasswordRequest();
        req.setPassword("pw");
        req.setFileId("file-9");
        req.setFileInput(new MockMultipartFile("f", new byte[] {1}));

        assertThat(req.getPassword()).isEqualTo("pw");
        assertThat(req.getFileId()).isEqualTo("file-9");
        assertThat(req.getFileInput()).isNotNull();
    }

    @Test
    @DisplayName("equals/hashCode for equal pair")
    void equalPair() {
        PDFPasswordRequest a = new PDFPasswordRequest();
        a.setPassword("pw");
        PDFPasswordRequest b = new PDFPasswordRequest();
        b.setPassword("pw");

        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
    }

    @Test
    @DisplayName("differs when password differs and vs null/other type")
    void notEqual() {
        PDFPasswordRequest a = new PDFPasswordRequest();
        a.setPassword("pw");
        PDFPasswordRequest b = new PDFPasswordRequest();
        b.setPassword("other");

        assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
    }

    @Test
    @DisplayName("toString contains class name and value")
    void toStringContent() {
        PDFPasswordRequest a = new PDFPasswordRequest();
        a.setPassword("secret");
        assertThat(a.toString()).contains("PDFPasswordRequest").contains("secret");
    }
}
