package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;
import java.security.KeyStore;
import java.security.KeyStoreException;
import java.security.PublicKey;
import java.security.cert.CertificateExpiredException;
import java.security.cert.X509Certificate;

import javax.security.auth.x500.X500Principal;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

/** Tests for the CertificateValidationService using mocked certificates. */
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

    @Test
    void testIsRevoked_ValidCertificate() {
        // When certificate is valid (not expired)
        boolean result = validationService.isRevoked(validCertificate);

        // Then it should not be considered revoked
        assertFalse(result, "Valid certificate should not be considered revoked");
    }

    @Test
    void testIsRevoked_ExpiredCertificate() {
        // When certificate is expired
        boolean result = validationService.isRevoked(expiredCertificate);

        // Then it should be considered revoked
        assertTrue(result, "Expired certificate should be considered revoked");
    }

    @Test
    void testValidateTrustWithCustomCert_Match() {
        // Create certificates with matching issuer and subject
        X509Certificate issuingCert = mock(X509Certificate.class);
        X509Certificate signedCert = mock(X509Certificate.class);

        // Create X500Principal objects for issuer and subject
        X500Principal issuerPrincipal = new X500Principal("CN=Test Issuer");

        // Mock the issuer of the signed certificate to match the subject of the issuing certificate
        when(signedCert.getIssuerX500Principal()).thenReturn(issuerPrincipal);
        when(issuingCert.getSubjectX500Principal()).thenReturn(issuerPrincipal);

        // When validating trust with custom cert
        boolean result = validationService.validateTrustWithCustomCert(signedCert, issuingCert);

        // Then validation should succeed
        assertTrue(result, "Certificate with matching issuer and subject should validate");

        // Ensure no exceptions are thrown during validation
        assertDoesNotThrow(() -> validationService.validateTrustWithCustomCert(null, issuingCert));
    }

    @Test
    void testValidateTrustWithCustomCert_NoMatch() {
        // Create certificates with non-matching issuer and subject
        X509Certificate issuingCert = mock(X509Certificate.class);
        X509Certificate signedCert = mock(X509Certificate.class);

        // Create X500Principal objects for issuer and subject
        X500Principal issuerPrincipal = new X500Principal("CN=Test Issuer");
        X500Principal differentPrincipal = new X500Principal("CN=Different Name");

        // Mock the issuer of the signed certificate to NOT match the subject of the issuing
        // certificate
        when(signedCert.getIssuerX500Principal()).thenReturn(issuerPrincipal);
        when(issuingCert.getSubjectX500Principal()).thenReturn(differentPrincipal);

        // When validating trust with custom cert
        boolean result = validationService.validateTrustWithCustomCert(signedCert, issuingCert);

        // Then validation should fail
        assertFalse(result, "Certificate with non-matching issuer and subject should not validate");
    }

    @Test
    void testValidateCertificateChainWithCustomCert_Success() throws Exception {
        // Setup mock certificates
        X509Certificate signedCert = mock(X509Certificate.class);
        X509Certificate signingCert = mock(X509Certificate.class);
        PublicKey publicKey = mock(PublicKey.class);

        when(signingCert.getPublicKey()).thenReturn(publicKey);

        // When verifying the certificate with the signing cert's public key, don't throw exception
        doNothing().when(signedCert).verify(Mockito.any());

        // When validating certificate chain with custom cert
        boolean result =
                validationService.validateCertificateChainWithCustomCert(signedCert, signingCert);

        // Then validation should succeed
        assertTrue(result, "Certificate chain with proper signing should validate");
    }

    @Test
    void testValidateCertificateChainWithCustomCert_Failure() throws Exception {
        // Setup mock certificates
        X509Certificate signedCert = mock(X509Certificate.class);
        X509Certificate signingCert = mock(X509Certificate.class);
        PublicKey publicKey = mock(PublicKey.class);

        when(signingCert.getPublicKey()).thenReturn(publicKey);

        // When verifying the certificate with the signing cert's public key, throw exception
        // Need to use a specific exception that verify() can throw
        doThrow(new java.security.SignatureException("Verification failed"))
                .when(signedCert)
                .verify(Mockito.any());

        // When validating certificate chain with custom cert
        boolean result =
                validationService.validateCertificateChainWithCustomCert(signedCert, signingCert);

        // Then validation should fail
        assertFalse(result, "Certificate chain with failed signing should not validate");
    }

    @Test
    void testValidateTrustStore_found_returnsTrue() throws Exception {
        KeyStore ks = mock(KeyStore.class);

        // A certificate mock that is both in the keystore and being checked:
        X509Certificate same = mock(X509Certificate.class);

        when(ks.aliases())
                .thenReturn(java.util.Collections.enumeration(java.util.List.of("alias1")));
        when(ks.getCertificate("alias1")).thenReturn(same);

        // Set trustStore via reflection
        var f = CertificateValidationService.class.getDeclaredField("trustStore");
        f.setAccessible(true);
        f.set(validationService, ks);

        // same instance -> equals() true without stubbing
        assertTrue(validationService.validateTrustStore(same));
    }

    @Test
    void testValidateTrustStore_notFound_returnsFalse() throws Exception {
        KeyStore ks = mock(KeyStore.class);

        X509Certificate inStore = mock(X509Certificate.class);
        X509Certificate probe = mock(X509Certificate.class);

        when(ks.aliases())
                .thenReturn(java.util.Collections.enumeration(java.util.List.of("alias1")));
        when(ks.getCertificate("alias1")).thenReturn(inStore); // != probe

        var f = CertificateValidationService.class.getDeclaredField("trustStore");
        f.setAccessible(true);
        f.set(validationService, ks);

        assertFalse(validationService.validateTrustStore(probe));
    }

    @Test
    void testValidateTrustStore_keyStoreAliasesThrows_returnsFalse() throws Exception {
        KeyStore ks = mock(KeyStore.class);
        when(ks.aliases()).thenThrow(new KeyStoreException("boom"));

        Field f = CertificateValidationService.class.getDeclaredField("trustStore");
        f.setAccessible(true);
        f.set(validationService, ks);

        X509Certificate probe = mock(X509Certificate.class);
        assertFalse(validationService.validateTrustStore(probe));
    }
}
