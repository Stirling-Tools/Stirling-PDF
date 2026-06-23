package stirling.software.SPDF.model.api.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SignatureValidationResultTest {

    @Test
    @DisplayName("all accessors round-trip")
    void accessorsRoundTrip() {
        SignatureValidationResult r = new SignatureValidationResult();
        r.setValid(true);
        r.setChainValid(true);
        r.setTrustValid(false);
        r.setChainValidationError("none");
        r.setCertPathLength(3);
        r.setNotExpired(true);
        r.setRevocationChecked(true);
        r.setRevocationStatus("good");
        r.setValidationTimeSource("timestamp");
        r.setSignerName("Bob");
        r.setSignatureDate("2026-01-01");
        r.setReason("agree");
        r.setLocation("HQ");
        r.setErrorMessage(null);
        r.setIssuerDN("CN=Issuer");
        r.setSubjectDN("CN=Subject");
        r.setSerialNumber("12345");
        r.setValidFrom("2025-01-01");
        r.setValidUntil("2027-01-01");
        r.setSignatureAlgorithm("SHA256withRSA");
        r.setKeySize(2048);
        r.setVersion("3");
        r.setKeyUsages(List.of("digitalSignature", "nonRepudiation"));
        r.setSelfSigned(true);

        assertThat(r.isValid()).isTrue();
        assertThat(r.isChainValid()).isTrue();
        assertThat(r.isTrustValid()).isFalse();
        assertThat(r.getChainValidationError()).isEqualTo("none");
        assertThat(r.getCertPathLength()).isEqualTo(3);
        assertThat(r.isNotExpired()).isTrue();
        assertThat(r.isRevocationChecked()).isTrue();
        assertThat(r.getRevocationStatus()).isEqualTo("good");
        assertThat(r.getValidationTimeSource()).isEqualTo("timestamp");
        assertThat(r.getSignerName()).isEqualTo("Bob");
        assertThat(r.getSignatureDate()).isEqualTo("2026-01-01");
        assertThat(r.getReason()).isEqualTo("agree");
        assertThat(r.getLocation()).isEqualTo("HQ");
        assertThat(r.getErrorMessage()).isNull();
        assertThat(r.getIssuerDN()).isEqualTo("CN=Issuer");
        assertThat(r.getSubjectDN()).isEqualTo("CN=Subject");
        assertThat(r.getSerialNumber()).isEqualTo("12345");
        assertThat(r.getValidFrom()).isEqualTo("2025-01-01");
        assertThat(r.getValidUntil()).isEqualTo("2027-01-01");
        assertThat(r.getSignatureAlgorithm()).isEqualTo("SHA256withRSA");
        assertThat(r.getKeySize()).isEqualTo(2048);
        assertThat(r.getVersion()).isEqualTo("3");
        assertThat(r.getKeyUsages()).containsExactly("digitalSignature", "nonRepudiation");
        assertThat(r.isSelfSigned()).isTrue();
    }

    @Test
    @DisplayName("equals, hashCode and toString are generated")
    void equality() {
        SignatureValidationResult a = new SignatureValidationResult();
        a.setSignerName("X");
        SignatureValidationResult b = new SignatureValidationResult();
        b.setSignerName("X");

        assertThat(a).isEqualTo(b).hasSameHashCodeAs(b);
        assertThat(a).isNotEqualTo(null).isNotEqualTo(new SignatureValidationResult());
        assertThat(a.toString()).contains("SignatureValidationResult");
    }
}
