package stirling.software.SPDF.model.api.security;

import static org.assertj.core.api.Assertions.*;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

@DisplayName("SignatureValidationRequest")
class SignatureValidationRequestTest {

    @Test
    @DisplayName("certFile and inherited fields round-trip")
    void roundTrip() {
        SignatureValidationRequest req = new SignatureValidationRequest();
        MockMultipartFile cert = new MockMultipartFile("c", new byte[] {1, 2});
        req.setCertFile(cert);
        req.setFileId("file-3");

        assertThat(req.getCertFile()).isSameAs(cert);
        assertThat(req.getFileId()).isEqualTo("file-3");
    }

    @Test
    @DisplayName("equals/hashCode for equal pair sharing the same certFile")
    void equalPair() {
        MockMultipartFile cert = new MockMultipartFile("c", new byte[] {1});
        SignatureValidationRequest a = new SignatureValidationRequest();
        a.setCertFile(cert);
        SignatureValidationRequest b = new SignatureValidationRequest();
        b.setCertFile(cert);

        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
    }

    @Test
    @DisplayName("differs by inherited field and vs null/other type")
    void notEqual() {
        SignatureValidationRequest a = new SignatureValidationRequest();
        a.setFileId("a");
        SignatureValidationRequest b = new SignatureValidationRequest();
        b.setFileId("b");

        assertThat(a).isNotEqualTo(b).isNotEqualTo(null).isNotEqualTo("string");
    }

    @Test
    @DisplayName("toString contains class name")
    void toStringContent() {
        assertThat(new SignatureValidationRequest().toString())
                .contains("SignatureValidationRequest");
    }
}
