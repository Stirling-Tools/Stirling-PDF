package stirling.software.proprietary.workflow.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.security.KeyStore;
import java.security.cert.X509Certificate;

import org.bouncycastle.asn1.x509.Extension;
import org.bouncycastle.cert.jcajce.JcaX509CertificateHolder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.ApplicationProperties.AutomaticallyGenerated;

@ExtendWith(MockitoExtension.class)
class GuestCertificateServiceTest {

    @Mock private ApplicationProperties applicationProperties;

    @Mock private AutomaticallyGenerated automaticallyGenerated;

    private GuestCertificateService service;

    @BeforeEach
    void setUp() {
        when(applicationProperties.getAutomaticallyGenerated()).thenReturn(automaticallyGenerated);
        when(automaticallyGenerated.getKey()).thenReturn("test-secret-key-for-unit-tests");
        service = new GuestCertificateService(applicationProperties);
    }

    @Test
    void generateGuestKeyStore_createsValidPKCS12() throws Exception {
        String email = "signer@example.com";

        KeyStore keyStore = service.generateGuestKeyStore(email);

        assertThat(keyStore).isNotNull();
        assertThat(keyStore.getType()).isEqualToIgnoringCase("PKCS12");
        assertThat(keyStore.aliases().hasMoreElements()).isTrue();
        String alias = keyStore.aliases().nextElement();
        assertThat(keyStore.isKeyEntry(alias)).isTrue();
        assertThat(keyStore.getCertificate(alias)).isNotNull();
    }

    @Test
    void generateGuestKeyStore_subjectContainsSanitizedEmail() throws Exception {
        String email = "signer@example.com";

        KeyStore keyStore = service.generateGuestKeyStore(email);
        String alias = keyStore.aliases().nextElement();
        X509Certificate cert = (X509Certificate) keyStore.getCertificate(alias);

        String subjectDn = cert.getSubjectX500Principal().getName();
        assertThat(subjectDn).contains("signer@example.com");
        assertThat(subjectDn).contains("Stirling-PDF Guest");
    }

    @Test
    void generateGuestKeyStore_sanContainsEmailRfc822Name() throws Exception {
        String email = "guest@test.org";

        KeyStore keyStore = service.generateGuestKeyStore(email);
        String alias = keyStore.aliases().nextElement();
        X509Certificate cert = (X509Certificate) keyStore.getCertificate(alias);

        // Parse SAN extension via BouncyCastle
        JcaX509CertificateHolder holder = new JcaX509CertificateHolder(cert);
        org.bouncycastle.asn1.x509.GeneralNames sans =
                org.bouncycastle.asn1.x509.GeneralNames.getInstance(
                        holder.getExtension(Extension.subjectAlternativeName).getParsedValue());

        boolean foundEmail = false;
        for (org.bouncycastle.asn1.x509.GeneralName gn : sans.getNames()) {
            if (gn.getTagNo() == org.bouncycastle.asn1.x509.GeneralName.rfc822Name) {
                String value = gn.getName().toString();
                if (value.equals(email)) {
                    foundEmail = true;
                }
            }
        }
        assertThat(foundEmail)
                .as("SAN should contain rfc822Name matching the signer's email")
                .isTrue();
    }

    @Test
    void generateGuestPassword_isDeterministic() {
        String email = "signer@example.com";

        String pw1 = service.generateGuestPassword(email);
        String pw2 = service.generateGuestPassword(email);

        assertThat(pw1).isEqualTo(pw2);
        assertThat(pw1).hasSize(32);
    }

    @Test
    void generateGuestPassword_differentEmails_differentPasswords() {
        String pw1 = service.generateGuestPassword("alice@example.com");
        String pw2 = service.generateGuestPassword("bob@example.com");

        assertThat(pw1).isNotEqualTo(pw2);
    }

    @Test
    void generateGuestPassword_fallbackWhenNoKey() {
        // If no app key is configured, should fall back to SHA-256 of email
        when(automaticallyGenerated.getKey()).thenReturn(null);

        String pw = service.generateGuestPassword("fallback@example.com");

        assertThat(pw).isNotNull();
        assertThat(pw).hasSize(32);
    }

    @Test
    void generateGuestKeyStore_certIsValidForSigning() throws Exception {
        String email = "signer@example.com";

        KeyStore keyStore = service.generateGuestKeyStore(email);
        String alias = keyStore.aliases().nextElement();
        X509Certificate cert = (X509Certificate) keyStore.getCertificate(alias);

        // Certificate must be currently valid
        cert.checkValidity();

        // Key usage must include digitalSignature (bit 0) and nonRepudiation (bit 1)
        boolean[] keyUsage = cert.getKeyUsage();
        assertThat(keyUsage).isNotNull();
        assertThat(keyUsage[0]).as("digitalSignature key usage").isTrue();
        assertThat(keyUsage[1]).as("nonRepudiation key usage").isTrue();
    }
}
