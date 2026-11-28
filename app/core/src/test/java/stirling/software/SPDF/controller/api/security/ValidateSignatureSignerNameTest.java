package stirling.software.SPDF.controller.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.security.cert.X509Certificate;

import javax.security.auth.x500.X500Principal;

import org.junit.jupiter.api.Test;

class ValidateSignatureSignerNameTest {

    private static X509Certificate certWithSubject(String subject) {
        X509Certificate cert = mock(X509Certificate.class);
        when(cert.getSubjectX500Principal()).thenReturn(new X500Principal(subject));
        return cert;
    }

    @Test
    void usesSignatureNameWhenPresent() {
        X509Certificate cert = certWithSubject("CN=Card Holder, O=Agency");

        assertThat(ValidateSignatureController.signerName("Typed Name", cert))
                .isEqualTo("Typed Name");
    }

    @Test
    void fallsBackToCertificateCommonName() {
        X509Certificate cert = certWithSubject("CN=Card Holder, O=Agency, C=US");

        assertThat(ValidateSignatureController.signerName(null, cert)).isEqualTo("Card Holder");
        assertThat(ValidateSignatureController.signerName("  ", cert)).isEqualTo("Card Holder");
    }

    @Test
    void fallsBackToFullSubjectWithoutCommonName() {
        X509Certificate cert = certWithSubject("O=Agency, C=US");

        assertThat(ValidateSignatureController.signerName(null, cert)).isEqualTo("O=Agency,C=US");
    }

    @Test
    void picksCommonNameInsideMultiValuedRdn() {
        X509Certificate cert = certWithSubject("OU=A+CN=Alice, O=Agency");

        assertThat(ValidateSignatureController.signerName(null, cert)).isEqualTo("Alice");
    }

    @Test
    void returnsCommonNameWithoutDnEscapes() {
        X509Certificate cert = certWithSubject("CN=Doe\\, Jane, O=Agency");

        assertThat(ValidateSignatureController.signerName(null, cert)).isEqualTo("Doe, Jane");
    }
}
