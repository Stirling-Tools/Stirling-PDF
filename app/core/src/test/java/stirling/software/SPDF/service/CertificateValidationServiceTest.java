package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.security.PublicKey;
import java.security.cert.CertificateExpiredException;
import java.security.cert.X509Certificate;

import javax.security.auth.x500.X500Principal;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

@DisplayName("CertificateValidationService Tests")
class CertificateValidationServiceTest {

    private CertificateValidationService validationService;
    private X509Certificate validCertificate;
    private X509Certificate expiredCertificate;

    @BeforeEach
    void setUp() throws Exception {
        validationService = new CertificateValidationService();

        // Create mock certificates
        validCertificate = mock(X509Certificate.class);
        expiredCertificate = mock(X509Certificate.class);

        // Set up behaviors for valid certificate
        doNothing().when(validCertificate).checkValidity(); // No exception means valid

        // Set up behaviors for expired certificate
        doThrow(new CertificateExpiredException("Certificate expired"))
                .when(expiredCertificate)
                .checkValidity();
    }

    @Nested
    @DisplayName("Certificate Revocation Tests")
    class CertificateRevocationTests {

        @Test
        @DisplayName("Valid certificate is not considered revoked")
        void testIsRevoked_ValidCertificate() {
            boolean result = validationService.isRevoked(validCertificate);
            assertFalse(result, "Valid certificate should not be considered revoked");
        }

        @Test
        @DisplayName("Expired certificate is considered revoked")
        void testIsRevoked_ExpiredCertificate() {
            boolean result = validationService.isRevoked(expiredCertificate);
            assertTrue(result, "Expired certificate should be considered revoked");
        }
    }

    @Nested
    @DisplayName("Trust Validation Tests with Custom Certificate")
    class TrustValidationTests {

        @Test
        @DisplayName("Validates trust when issuer and subject match")
        void testValidateTrustWithCustomCert_Match() {
            X509Certificate issuingCert = mock(X509Certificate.class);
            X509Certificate signedCert = mock(X509Certificate.class);

            X500Principal issuerPrincipal = new X500Principal("CN=Test Issuer");

            when(signedCert.getIssuerX500Principal()).thenReturn(issuerPrincipal);
            when(issuingCert.getSubjectX500Principal()).thenReturn(issuerPrincipal);

            boolean result = validationService.validateTrustWithCustomCert(signedCert, issuingCert);

            assertTrue(result, "Certificate with matching issuer and subject should validate");
        }

        @Test
        @DisplayName("Fails trust validation when issuer and subject do not match")
        void testValidateTrustWithCustomCert_NoMatch() {
            X509Certificate issuingCert = mock(X509Certificate.class);
            X509Certificate signedCert = mock(X509Certificate.class);

            X500Principal issuerPrincipal = new X500Principal("CN=Test Issuer");
            X500Principal differentPrincipal = new X500Principal("CN=Different Name");

            when(signedCert.getIssuerX500Principal()).thenReturn(issuerPrincipal);
            when(issuingCert.getSubjectX500Principal()).thenReturn(differentPrincipal);

            boolean result = validationService.validateTrustWithCustomCert(signedCert, issuingCert);

            assertFalse(
                    result, "Certificate with non-matching issuer and subject should not validate");
        }
    }

    @Nested
    @DisplayName("Certificate Chain Validation Tests with Custom Certificate")
    class CertificateChainValidationTests {

        @Test
        @DisplayName("Validates certificate chain when signature verification succeeds")
        void testValidateCertificateChainWithCustomCert_Success() throws Exception {
            X509Certificate signedCert = mock(X509Certificate.class);
            X509Certificate signingCert = mock(X509Certificate.class);
            PublicKey publicKey = mock(PublicKey.class);

            when(signingCert.getPublicKey()).thenReturn(publicKey);
            doNothing().when(signedCert).verify(Mockito.any());

            boolean result =
                    validationService.validateCertificateChainWithCustomCert(
                            signedCert, signingCert);

            assertTrue(result, "Certificate chain with proper signing should validate");
        }

        @Test
        @DisplayName("Fails certificate chain validation when signature verification fails")
        void testValidateCertificateChainWithCustomCert_Failure() throws Exception {
            X509Certificate signedCert = mock(X509Certificate.class);
            X509Certificate signingCert = mock(X509Certificate.class);
            PublicKey publicKey = mock(PublicKey.class);

            when(signingCert.getPublicKey()).thenReturn(publicKey);
            doThrow(new java.security.SignatureException("Verification failed"))
                    .when(signedCert)
                    .verify(Mockito.any());

            boolean result =
                    validationService.validateCertificateChainWithCustomCert(
                            signedCert, signingCert);

            assertFalse(result, "Certificate chain with failed signing should not validate");
        }
    }
}
