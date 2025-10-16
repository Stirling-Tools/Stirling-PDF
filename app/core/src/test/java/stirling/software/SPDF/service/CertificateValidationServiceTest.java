package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.security.cert.CertificateExpiredException;
import java.security.cert.X509Certificate;
import java.util.Date;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;

/** Tests for the CertificateValidationService using mocked certificates. */
class CertificateValidationServiceTest {

    private CertificateValidationService validationService;
    private X509Certificate validCertificate;
    private X509Certificate expiredCertificate;

    @BeforeEach
    void setUp() throws Exception {
        // Create mock ApplicationProperties with default validation settings
        ApplicationProperties applicationProperties = mock(ApplicationProperties.class);
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

        // Create mock certificates
        validCertificate = mock(X509Certificate.class);
        expiredCertificate = mock(X509Certificate.class);

        // Set up behaviors for valid certificate (both overloads)
        doNothing().when(validCertificate).checkValidity();
        doNothing().when(validCertificate).checkValidity(any(Date.class));

        // Set up behaviors for expired certificate (both overloads)
        doThrow(new CertificateExpiredException("Certificate expired"))
                .when(expiredCertificate)
                .checkValidity();
        doThrow(new CertificateExpiredException("Certificate expired"))
                .when(expiredCertificate)
                .checkValidity(any(Date.class));
    }

    @Test
    void testIsOutsideValidityPeriod_ValidCertificate() {
        // When certificate is valid (not expired)
        boolean result = validationService.isOutsideValidityPeriod(validCertificate, new Date());

        // Then it should not be outside validity period
        assertFalse(result, "Valid certificate should not be outside validity period");
    }

    @Test
    void testIsOutsideValidityPeriod_ExpiredCertificate() {
        // When certificate is expired
        boolean result = validationService.isOutsideValidityPeriod(expiredCertificate, new Date());

        // Then it should be outside validity period
        assertTrue(result, "Expired certificate should be outside validity period");
    }

    // Note: Full integration tests for buildAndValidatePath() would require
    // real certificate chains and trust anchors. These would be better as
    // integration tests using actual signed PDFs from the test-signed-pdfs directory.
}
