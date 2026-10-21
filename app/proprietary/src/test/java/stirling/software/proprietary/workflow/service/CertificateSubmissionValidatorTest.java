package stirling.software.proprietary.workflow.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.Date;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.service.PdfSigningService;
import stirling.software.proprietary.workflow.dto.CertificateInfo;

@ExtendWith(MockitoExtension.class)
class CertificateSubmissionValidatorTest {

    @Mock private PdfSigningService pdfSigningService;

    private CertificateSubmissionValidator validator;

    @BeforeEach
    void setUp() {
        validator = new CertificateSubmissionValidator(pdfSigningService);
    }

    // ---- helper: build a PKCS12 keystore with a self-signed cert ----

    private static byte[] buildP12Keystore(
            String alias, String password, Date notBefore, Date notAfter) throws Exception {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
        kpg.initialize(2048);
        KeyPair kp = kpg.generateKeyPair();

        X500Name subject = new X500Name("CN=Test Signer,O=Test Org,C=GB");
        ContentSigner signer = new JcaContentSignerBuilder("SHA256withRSA").build(kp.getPrivate());
        X509Certificate cert =
                new JcaX509CertificateConverter()
                        .getCertificate(
                                new JcaX509v3CertificateBuilder(
                                                subject,
                                                BigInteger.valueOf(System.currentTimeMillis()),
                                                notBefore,
                                                notAfter,
                                                subject,
                                                kp.getPublic())
                                        .build(signer));

        KeyStore ks = KeyStore.getInstance("PKCS12");
        ks.load(null, null);
        ks.setKeyEntry(alias, kp.getPrivate(), password.toCharArray(), new Certificate[] {cert});

        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        ks.store(bos, password.toCharArray());
        return bos.toByteArray();
    }

    private static byte[] validP12(String password) throws Exception {
        Date now = new Date();
        Date future = new Date(now.getTime() + 365L * 24 * 60 * 60 * 1000);
        return buildP12Keystore("test", password, now, future);
    }

    private static byte[] expiredP12(String password) throws Exception {
        Date past1 = new Date(System.currentTimeMillis() - 10_000_000L);
        Date past2 = new Date(System.currentTimeMillis() - 1_000L);
        return buildP12Keystore("test", password, past1, past2);
    }

    private static byte[] notYetValidP12(String password) throws Exception {
        Date future1 = new Date(System.currentTimeMillis() + 10_000_000L);
        Date future2 = new Date(System.currentTimeMillis() + 20_000_000L);
        return buildP12Keystore("test", password, future1, future2);
    }

    // ---- SERVER type: skip validation ----

    @Test
    void serverCertType_returnsNull_withoutCallingSigningService() throws Exception {
        CertificateInfo result = validator.validateAndExtractInfo(new byte[0], "SERVER", "pass");

        assertThat(result).isNull();
        verify(pdfSigningService, never())
                .signWithKeystore(
                        any(),
                        any(),
                        any(),
                        anyBoolean(),
                        any(),
                        any(),
                        any(),
                        any(),
                        anyBoolean(),
                        isNull(),
                        isNull(),
                        isNull(),
                        isNull());
    }

    @Test
    void nullCertType_returnsNull_withoutCallingSigningService() throws Exception {
        CertificateInfo result = validator.validateAndExtractInfo(new byte[0], null, "pass");

        assertThat(result).isNull();
        verify(pdfSigningService, never())
                .signWithKeystore(
                        any(),
                        any(),
                        any(),
                        anyBoolean(),
                        any(),
                        any(),
                        any(),
                        any(),
                        anyBoolean(),
                        isNull(),
                        isNull(),
                        isNull(),
                        isNull());
    }

    // ---- Valid P12 certificate ----

    @Test
    void validP12Certificate_returnsInfo() throws Exception {
        byte[] p12 = validP12("password");
        when(pdfSigningService.signWithKeystore(
                        any(),
                        any(),
                        any(),
                        anyBoolean(),
                        isNull(),
                        anyString(),
                        isNull(),
                        isNull(),
                        anyBoolean(),
                        isNull(),
                        isNull(),
                        isNull(),
                        isNull()))
                .thenReturn(new byte[0]);

        CertificateInfo info = validator.validateAndExtractInfo(p12, "P12", "password");

        assertThat(info).isNotNull();
        assertThat(info.subjectName()).isEqualTo("Test Signer");
        assertThat(info.notAfter()).isNotNull();
        assertThat(info.notAfter()).isAfter(new Date());
    }

    @Test
    void validPkcs12Alias_acceptedAsCertType() throws Exception {
        byte[] p12 = validP12("password");
        when(pdfSigningService.signWithKeystore(
                        any(),
                        any(),
                        any(),
                        anyBoolean(),
                        isNull(),
                        anyString(),
                        isNull(),
                        isNull(),
                        anyBoolean(),
                        isNull(),
                        isNull(),
                        isNull(),
                        isNull()))
                .thenReturn(new byte[0]);

        CertificateInfo info = validator.validateAndExtractInfo(p12, "PKCS12", "password");

        assertThat(info).isNotNull();
    }

    @Test
    void validPfxAlias_acceptedAsCertType() throws Exception {
        byte[] p12 = validP12("password");
        when(pdfSigningService.signWithKeystore(
                        any(),
                        any(),
                        any(),
                        anyBoolean(),
                        isNull(),
                        anyString(),
                        isNull(),
                        isNull(),
                        anyBoolean(),
                        isNull(),
                        isNull(),
                        isNull(),
                        isNull()))
                .thenReturn(new byte[0]);

        CertificateInfo info = validator.validateAndExtractInfo(p12, "PFX", "password");

        assertThat(info).isNotNull();
    }

    // ---- Wrong password ----

    @Test
    void wrongPassword_throws400() {
        byte[] p12;
        try {
            p12 = validP12("correct-password");
        } catch (Exception e) {
            throw new RuntimeException(e);
        }

        assertThatThrownBy(() -> validator.validateAndExtractInfo(p12, "P12", "wrong-password"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        ex ->
                                assertThat(((ResponseStatusException) ex).getStatusCode())
                                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    // ---- Corrupt keystore bytes ----

    @Test
    void corruptBytes_throws400() {
        byte[] garbage = "this is not a keystore".getBytes();

        assertThatThrownBy(() -> validator.validateAndExtractInfo(garbage, "P12", "password"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        ex ->
                                assertThat(((ResponseStatusException) ex).getStatusCode())
                                        .isEqualTo(HttpStatus.BAD_REQUEST));
    }

    // ---- Expired certificate ----

    @Test
    void expiredCertificate_throws400WithExpiryDateInMessage() {
        byte[] p12;
        try {
            p12 = expiredP12("password");
        } catch (Exception e) {
            throw new RuntimeException(e);
        }

        assertThatThrownBy(() -> validator.validateAndExtractInfo(p12, "P12", "password"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        ex -> {
                            ResponseStatusException rse = (ResponseStatusException) ex;
                            assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                            assertThat(rse.getReason()).contains("expired");
                        });
    }

    // ---- Not-yet-valid certificate ----

    @Test
    void notYetValidCertificate_throws400() {
        byte[] p12;
        try {
            p12 = notYetValidP12("password");
        } catch (Exception e) {
            throw new RuntimeException(e);
        }

        assertThatThrownBy(() -> validator.validateAndExtractInfo(p12, "P12", "password"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        ex -> {
                            ResponseStatusException rse = (ResponseStatusException) ex;
                            assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                            assertThat(rse.getReason()).contains("not yet valid");
                        });
    }

    // ---- Test-sign failure ----

    @Test
    void signingServiceThrows_wrapsAs400() throws Exception {
        byte[] p12 = validP12("password");
        doThrow(new RuntimeException("algorithm not supported"))
                .when(pdfSigningService)
                .signWithKeystore(
                        any(),
                        any(),
                        any(),
                        anyBoolean(),
                        isNull(),
                        anyString(),
                        isNull(),
                        isNull(),
                        anyBoolean(),
                        isNull(),
                        isNull(),
                        isNull(),
                        isNull());

        assertThatThrownBy(() -> validator.validateAndExtractInfo(p12, "P12", "password"))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(
                        ex -> {
                            ResponseStatusException rse = (ResponseStatusException) ex;
                            assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                            assertThat(rse.getReason()).contains("compatible");
                        });
    }

    // ---- JKS keystore ----

    @Test
    void validJksKeystore_returnsInfo() throws Exception {
        // Build a JKS keystore with the same cert
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
        kpg.initialize(2048);
        KeyPair kp = kpg.generateKeyPair();

        X500Name subject = new X500Name("CN=JKS Signer,O=Test,C=GB");
        Date now = new Date();
        Date future = new Date(now.getTime() + 365L * 24 * 60 * 60 * 1000);
        ContentSigner signer = new JcaContentSignerBuilder("SHA256withRSA").build(kp.getPrivate());
        X509Certificate cert =
                new JcaX509CertificateConverter()
                        .getCertificate(
                                new JcaX509v3CertificateBuilder(
                                                subject,
                                                BigInteger.valueOf(System.currentTimeMillis()),
                                                now,
                                                future,
                                                subject,
                                                kp.getPublic())
                                        .build(signer));

        KeyStore jks = KeyStore.getInstance("JKS");
        jks.load(null, null);
        jks.setKeyEntry(
                "jks-test", kp.getPrivate(), "jkspass".toCharArray(), new Certificate[] {cert});

        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        jks.store(bos, "jkspass".toCharArray());
        byte[] jksBytes = bos.toByteArray();

        when(pdfSigningService.signWithKeystore(
                        any(),
                        any(),
                        any(),
                        anyBoolean(),
                        isNull(),
                        anyString(),
                        isNull(),
                        isNull(),
                        anyBoolean(),
                        isNull(),
                        isNull(),
                        isNull(),
                        isNull()))
                .thenReturn(new byte[0]);

        CertificateInfo info = validator.validateAndExtractInfo(jksBytes, "JKS", "jkspass");

        assertThat(info).isNotNull();
        assertThat(info.subjectName()).isEqualTo("JKS Signer");
    }
}
