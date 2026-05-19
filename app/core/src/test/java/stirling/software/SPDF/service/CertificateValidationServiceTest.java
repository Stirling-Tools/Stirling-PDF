package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.security.KeyStore;
import java.security.PublicKey;
import java.security.cert.CertificateEncodingException;
import java.security.cert.CertificateExpiredException;
import java.security.cert.CertificateNotYetValidException;
import java.security.cert.X509Certificate;
import java.util.Collection;
import java.util.Date;
import java.util.List;

import javax.security.auth.x500.X500Principal;

import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cms.SignerInformation;
import org.bouncycastle.util.CollectionStore;
import org.bouncycastle.util.Store;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;

class CertificateValidationServiceTest {

    private CertificateValidationService validationService;
    private ApplicationProperties applicationProperties;
    private X509Certificate validCertificate;
    private X509Certificate expiredCertificate;

    @BeforeEach
    void setUp() throws Exception {
        applicationProperties = mock(ApplicationProperties.class);
        ApplicationProperties.Security security = mock(ApplicationProperties.Security.class);
        ApplicationProperties.Security.Validation validation =
                mock(ApplicationProperties.Security.Validation.class);
        ApplicationProperties.Security.Validation.Trust trust =
                mock(ApplicationProperties.Security.Validation.Trust.class);
        ApplicationProperties.Security.Validation.Revocation revocation =
                mock(ApplicationProperties.Security.Validation.Revocation.class);
        when(applicationProperties.getSecurity()).thenReturn(security);
        when(security.getValidation()).thenReturn(validation);
        when(validation.getTrust()).thenReturn(trust);
        when(validation.getRevocation()).thenReturn(revocation);
        when(validation.isAllowAIA()).thenReturn(false);
        when(trust.isServerAsAnchor()).thenReturn(false);
        when(trust.isUseSystemTrust()).thenReturn(false);
        when(trust.isUseMozillaBundle()).thenReturn(false);
        when(trust.isUseAATL()).thenReturn(false);
        when(trust.isUseEUTL()).thenReturn(false);
        when(revocation.getMode()).thenReturn("none");
        when(revocation.isHardFail()).thenReturn(false);
        validationService = new CertificateValidationService(null, applicationProperties);
        validCertificate = mock(X509Certificate.class);
        expiredCertificate = mock(X509Certificate.class);
        doNothing().when(validCertificate).checkValidity();
        doNothing().when(validCertificate).checkValidity(any(Date.class));
        doThrow(new CertificateExpiredException("Certificate expired"))
                .when(expiredCertificate)
                .checkValidity();
        doThrow(new CertificateExpiredException("Certificate expired"))
                .when(expiredCertificate)
                .checkValidity(any(Date.class));
    }

    @Test
    void testIsOutsideValidityPeriod_ValidCertificate() {
        boolean result = validationService.isOutsideValidityPeriod(validCertificate, new Date());
        assertFalse(result, "Valid certificate should not be outside validity period");
    }

    @Test
    void testIsOutsideValidityPeriod_ExpiredCertificate() {
        boolean result = validationService.isOutsideValidityPeriod(expiredCertificate, new Date());
        assertTrue(result, "Expired certificate should be outside validity period");
    }

    @Test
    void testIsOutsideValidityPeriod_NotYetValid() throws Exception {
        X509Certificate notYetValid = mock(X509Certificate.class);
        doThrow(new CertificateNotYetValidException("Not yet valid"))
                .when(notYetValid)
                .checkValidity(any(Date.class));
        boolean result = validationService.isOutsideValidityPeriod(notYetValid, new Date());
        assertTrue(result);
    }

    @Test
    void testIsCA_WithCACertificate() {
        X509Certificate caCert = mock(X509Certificate.class);
        when(caCert.getBasicConstraints()).thenReturn(Integer.MAX_VALUE);
        assertTrue(validationService.isCA(caCert));
    }

    @Test
    void testIsCA_WithEndEntityCertificate() {
        X509Certificate endCert = mock(X509Certificate.class);
        when(endCert.getBasicConstraints()).thenReturn(-1);
        assertFalse(validationService.isCA(endCert));
    }

    @Test
    void testIsCA_WithZeroPathLength() {
        X509Certificate caCert = mock(X509Certificate.class);
        when(caCert.getBasicConstraints()).thenReturn(0);
        assertTrue(validationService.isCA(caCert));
    }

    @Test
    void testIsSelfSigned_SelfSignedCert() throws Exception {
        X509Certificate selfSigned = mock(X509Certificate.class);
        X500Principal principal = new X500Principal("CN=Test");
        when(selfSigned.getSubjectX500Principal()).thenReturn(principal);
        when(selfSigned.getIssuerX500Principal()).thenReturn(principal);
        PublicKey publicKey = mock(PublicKey.class);
        when(selfSigned.getPublicKey()).thenReturn(publicKey);
        doNothing().when(selfSigned).verify(publicKey);
        assertTrue(validationService.isSelfSigned(selfSigned));
    }

    @Test
    void testIsSelfSigned_DifferentIssuerAndSubject() {
        X509Certificate cert = mock(X509Certificate.class);
        when(cert.getSubjectX500Principal()).thenReturn(new X500Principal("CN=Subject"));
        when(cert.getIssuerX500Principal()).thenReturn(new X500Principal("CN=Issuer"));
        assertFalse(validationService.isSelfSigned(cert));
    }

    @Test
    void testIsSelfSigned_VerifyThrowsException() throws Exception {
        X509Certificate cert = mock(X509Certificate.class);
        X500Principal principal = new X500Principal("CN=Test");
        when(cert.getSubjectX500Principal()).thenReturn(principal);
        when(cert.getIssuerX500Principal()).thenReturn(principal);
        PublicKey publicKey = mock(PublicKey.class);
        when(cert.getPublicKey()).thenReturn(publicKey);
        doThrow(new java.security.SignatureException("Bad signature")).when(cert).verify(publicKey);
        assertFalse(validationService.isSelfSigned(cert));
    }

    @Test
    void testSha256Fingerprint_ValidCert() throws Exception {
        X509Certificate cert = mock(X509Certificate.class);
        when(cert.getEncoded()).thenReturn(new byte[] {1, 2, 3, 4, 5});
        String fingerprint = validationService.sha256Fingerprint(cert);
        assertNotNull(fingerprint);
        assertFalse(fingerprint.isEmpty());
        assertEquals(64, fingerprint.length());
        assertTrue(fingerprint.matches("[0-9A-F]+"));
    }

    @Test
    void testSha256Fingerprint_EncodingThrowsException() throws Exception {
        X509Certificate cert = mock(X509Certificate.class);
        when(cert.getEncoded()).thenThrow(new CertificateEncodingException("encoding error"));
        String fingerprint = validationService.sha256Fingerprint(cert);
        assertEquals("", fingerprint);
    }

    @Test
    void testSha256Fingerprint_DifferentCertsProduceDifferentFingerprints() throws Exception {
        X509Certificate cert1 = mock(X509Certificate.class);
        when(cert1.getEncoded()).thenReturn(new byte[] {1, 2, 3});
        X509Certificate cert2 = mock(X509Certificate.class);
        when(cert2.getEncoded()).thenReturn(new byte[] {4, 5, 6});
        String fp1 = validationService.sha256Fingerprint(cert1);
        String fp2 = validationService.sha256Fingerprint(cert2);
        assertNotEquals(fp1, fp2);
    }

    @Test
    void testSha256Fingerprint_SameCertProducesSameFingerprint() throws Exception {
        X509Certificate cert = mock(X509Certificate.class);
        when(cert.getEncoded()).thenReturn(new byte[] {10, 20, 30});
        String fp1 = validationService.sha256Fingerprint(cert);
        String fp2 = validationService.sha256Fingerprint(cert);
        assertEquals(fp1, fp2);
    }

    @Test
    void testIsRevocationEnabled_NoneMode() {
        assertFalse(validationService.isRevocationEnabled());
    }

    @Test
    void testIsRevocationEnabled_OcspMode() throws Exception {
        CertificateValidationService svc = createServiceWithRevocationMode("ocsp");
        assertTrue(svc.isRevocationEnabled());
    }

    @Test
    void testIsRevocationEnabled_CrlMode() throws Exception {
        CertificateValidationService svc = createServiceWithRevocationMode("crl");
        assertTrue(svc.isRevocationEnabled());
    }

    @Test
    void testIsRevocationEnabled_NoneCaseInsensitive() throws Exception {
        CertificateValidationService svc = createServiceWithRevocationMode("NONE");
        assertFalse(svc.isRevocationEnabled());
    }

    private CertificateValidationService createServiceWithRevocationMode(String mode)
            throws Exception {
        ApplicationProperties props = mock(ApplicationProperties.class);
        ApplicationProperties.Security sec = mock(ApplicationProperties.Security.class);
        ApplicationProperties.Security.Validation val =
                mock(ApplicationProperties.Security.Validation.class);
        ApplicationProperties.Security.Validation.Trust trust =
                mock(ApplicationProperties.Security.Validation.Trust.class);
        ApplicationProperties.Security.Validation.Revocation rev =
                mock(ApplicationProperties.Security.Validation.Revocation.class);
        when(props.getSecurity()).thenReturn(sec);
        when(sec.getValidation()).thenReturn(val);
        when(val.getTrust()).thenReturn(trust);
        when(val.getRevocation()).thenReturn(rev);
        when(val.isAllowAIA()).thenReturn(false);
        when(trust.isServerAsAnchor()).thenReturn(false);
        when(trust.isUseSystemTrust()).thenReturn(false);
        when(trust.isUseMozillaBundle()).thenReturn(false);
        when(trust.isUseAATL()).thenReturn(false);
        when(trust.isUseEUTL()).thenReturn(false);
        when(rev.getMode()).thenReturn(mode);
        when(rev.isHardFail()).thenReturn(false);
        return new CertificateValidationService(null, props);
    }

    @Test
    void testExtractValidationTime_NoAttributes() {
        SignerInformation signerInfo = mock(SignerInformation.class);
        when(signerInfo.getUnsignedAttributes()).thenReturn(null);
        when(signerInfo.getSignedAttributes()).thenReturn(null);
        CertificateValidationService.ValidationTime result =
                validationService.extractValidationTime(signerInfo);
        assertNull(result);
    }

    @Test
    void testExtractIntermediateCertificates_EmptyStore() {
        Store<X509CertificateHolder> emptyStore = new CollectionStore<>(List.of());
        X509Certificate signerCert = mock(X509Certificate.class);
        Collection<X509Certificate> intermediates =
                validationService.extractIntermediateCertificates(emptyStore, signerCert);
        assertTrue(intermediates.isEmpty());
    }

    @Test
    void testGetSigningTrustStore_NullWithoutPostConstruct() {
        // @PostConstruct is not called in unit tests, so signingTrustAnchors is null
        KeyStore trustStore = validationService.getSigningTrustStore();
        assertNull(trustStore);
    }

    @Test
    void testValidationTime_Constructor() {
        Date now = new Date();
        CertificateValidationService.ValidationTime vt =
                new CertificateValidationService.ValidationTime(now, "timestamp");
        assertEquals(now, vt.date);
        assertEquals("timestamp", vt.source);
    }

    @Test
    void testValidationTime_SigningTimeSource() {
        Date now = new Date();
        CertificateValidationService.ValidationTime vt =
                new CertificateValidationService.ValidationTime(now, "signing-time");
        assertEquals("signing-time", vt.source);
    }

    @Test
    void testValidationTime_CurrentSource() {
        Date now = new Date();
        CertificateValidationService.ValidationTime vt =
                new CertificateValidationService.ValidationTime(now, "current");
        assertEquals("current", vt.source);
        assertEquals(now, vt.date);
    }

    @Test
    void testConstructorWithNullServerCertService() throws Exception {
        CertificateValidationService svc =
                new CertificateValidationService(null, applicationProperties);
        assertNotNull(svc);
        // @PostConstruct not invoked in unit tests, trust store remains null
        assertNull(svc.getSigningTrustStore());
    }

    @Test
    void testBuildAndValidatePath_NoAnchorsThrows() {
        X509Certificate signerCert = mock(X509Certificate.class);
        assertThrows(
                Exception.class,
                () ->
                        validationService.buildAndValidatePath(
                                signerCert, List.of(), null, new Date()));
    }
}
