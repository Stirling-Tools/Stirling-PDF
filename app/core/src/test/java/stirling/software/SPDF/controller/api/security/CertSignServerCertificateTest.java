package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigInteger;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.cert.X509Certificate;
import java.util.Date;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import stirling.software.SPDF.model.api.security.HardwareCertificateInfo;
import stirling.software.SPDF.service.HardwareKeyStoreService;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.ServerCertificateServiceInterface;
import stirling.software.common.util.TempFileManager;

class CertSignServerCertificateTest {

    private static CertSignController controller(ServerCertificateServiceInterface service) {
        return new CertSignController(
                mock(CustomPDFDocumentFactory.class),
                service,
                mock(TempFileManager.class),
                mock(HardwareKeyStoreService.class));
    }

    private static X509Certificate certificate() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        KeyPair pair = generator.generateKeyPair();
        Date now = new Date();
        return new JcaX509CertificateConverter()
                .getCertificate(
                        new JcaX509v3CertificateBuilder(
                                        new X500Name("CN=Stirling Issuing CA"),
                                        BigInteger.TEN,
                                        now,
                                        new Date(now.getTime() + 86_400_000L),
                                        new X500Name("CN=Records Office, O=Example Agency"),
                                        pair.getPublic())
                                .build(
                                        new JcaContentSignerBuilder("SHA256withRSA")
                                                .build(pair.getPrivate())));
    }

    @Test
    void describesTheCertificateServerSigningUses() throws Exception {
        ServerCertificateServiceInterface service = mock(ServerCertificateServiceInterface.class);
        when(service.isEnabled()).thenReturn(true);
        when(service.hasServerCertificate()).thenReturn(true);
        when(service.getServerCertificate()).thenReturn(certificate());

        ResponseEntity<HardwareCertificateInfo> response =
                controller(service).getServerCertificate();

        assertEquals(HttpStatus.OK, response.getStatusCode());
        HardwareCertificateInfo info = response.getBody();
        assertEquals("Records Office", info.subjectCommonName());
        assertEquals("Stirling Issuing CA", info.issuerCommonName());
        assertEquals("SERVER", info.source());
        assertFalse(info.expired());
    }

    @Test
    void isNotFoundWithoutTheServerCertificateService() throws Exception {
        assertEquals(HttpStatus.NOT_FOUND, controller(null).getServerCertificate().getStatusCode());
    }

    @Test
    void isNotFoundWhenTheFeatureIsDisabled() throws Exception {
        ServerCertificateServiceInterface service = mock(ServerCertificateServiceInterface.class);
        when(service.isEnabled()).thenReturn(false);

        assertEquals(
                HttpStatus.NOT_FOUND, controller(service).getServerCertificate().getStatusCode());
    }

    @Test
    void isNotFoundWhenNoCertificateIsConfigured() throws Exception {
        ServerCertificateServiceInterface service = mock(ServerCertificateServiceInterface.class);
        when(service.isEnabled()).thenReturn(true);
        when(service.hasServerCertificate()).thenReturn(false);

        assertEquals(
                HttpStatus.NOT_FOUND, controller(service).getServerCertificate().getStatusCode());
    }
}
