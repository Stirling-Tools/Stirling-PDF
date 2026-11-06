package stirling.software.SPDF.controller.api.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.nio.file.Files;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.bouncycastle.cms.CMSProcessableByteArray;
import org.bouncycastle.cms.CMSSignedData;
import org.bouncycastle.cms.SignerInformation;
import org.bouncycastle.cms.jcajce.JcaSimpleSignerInfoVerifierBuilder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.SPDF.model.api.security.SignPDFWithCertRequest;
import stirling.software.SPDF.service.HardwareKeyStoreService;
import stirling.software.SPDF.utils.text.TextEncodingHelper;
import stirling.software.SPDF.utils.text.WidthCalculator;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class CertSignControllerTest {
    private static ResponseEntity<Resource> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(new ByteArrayResource(bytes));
    }

    private static byte[] drainBody(ResponseEntity<Resource> response) throws java.io.IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        try (java.io.InputStream __in = response.getBody().getInputStream()) {
            __in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @Mock private HardwareKeyStoreService hardwareKeyStoreService;
    @Mock private HttpServletRequest httpRequest;

    @InjectMocks private CertSignController certSignController;

    private byte[] pdfBytes;
    private byte[] pfxBytes;
    private byte[] p12Bytes;
    private byte[] jksBytes;
    private byte[] pemKeyBytes;
    private byte[] pemCertBytes;
    private byte[] keyBytes;
    private byte[] crtCertBytes;
    private byte[] cerCertBytes;
    private byte[] derCertBytes;

    @BeforeEach
    void setUp() throws Exception {
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("test", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            pdfBytes = baos.toByteArray();
        }
        ClassPathResource pfxResource = new ClassPathResource("certs/test-cert.pfx");
        try (InputStream is = pfxResource.getInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            is.transferTo(baos);
            pfxBytes = baos.toByteArray();
        }
        ClassPathResource p12Resource = new ClassPathResource("certs/test-cert.p12");
        try (InputStream is = p12Resource.getInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            is.transferTo(baos);
            p12Bytes = baos.toByteArray();
        }
        ClassPathResource jksResource = new ClassPathResource("certs/test-cert.jks");
        try (InputStream is = jksResource.getInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            is.transferTo(baos);
            jksBytes = baos.toByteArray();
        }
        ClassPathResource pemKeyResource = new ClassPathResource("certs/test-key.pem");
        try (InputStream is = pemKeyResource.getInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            is.transferTo(baos);
            pemKeyBytes = baos.toByteArray();
        }
        ClassPathResource pemCertResource = new ClassPathResource("certs/test-cert.pem");
        try (InputStream is = pemCertResource.getInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            is.transferTo(baos);
            pemCertBytes = baos.toByteArray();
        }
        ClassPathResource keyResource = new ClassPathResource("certs/test-key.key");
        try (InputStream is = keyResource.getInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            is.transferTo(baos);
            keyBytes = baos.toByteArray();
        }
        ClassPathResource crtResource = new ClassPathResource("certs/test-cert.crt");
        try (InputStream is = crtResource.getInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            is.transferTo(baos);
            crtCertBytes = baos.toByteArray();
        }
        ClassPathResource cerResource = new ClassPathResource("certs/test-cert.cer");
        try (InputStream is = cerResource.getInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            is.transferTo(baos);
            cerCertBytes = baos.toByteArray();
        }
        ClassPathResource derCertResource = new ClassPathResource("certs/test-cert.der");
        try (InputStream is = derCertResource.getInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            is.transferTo(baos);
            derCertBytes = baos.toByteArray();
        }

        lenient()
                .when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(
                        invocation -> {
                            MultipartFile file = invocation.getArgument(0);
                            return Loader.loadPDF(file.getBytes());
                        });
    }

    @Test
    void testSignPdfWithPfx() throws Exception {
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);
        MockMultipartFile pfxFile =
                new MockMultipartFile("p12File", "test-cert.pfx", "application/x-pkcs12", pfxBytes);

        SignPDFWithCertRequest request = new SignPDFWithCertRequest();
        request.setFileInput(pdfFile);
        request.setCertType("PFX");
        request.setP12File(pfxFile);
        request.setPassword("password");
        request.setShowSignature(false);
        request.setReason("test");
        request.setLocation("test");
        request.setName("tester");
        request.setPageNumber(1);
        request.setShowLogo(false);

        ResponseEntity<Resource> response =
                certSignController.signPDFWithCert(request, httpRequest);

        assertNotNull(response.getBody());
        assertTrue(drainBody(response).length > 0);
    }

    @Test
    void testSignPdfWithPkcs12() throws Exception {
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);
        MockMultipartFile p12File =
                new MockMultipartFile("p12File", "test-cert.p12", "application/x-pkcs12", p12Bytes);

        SignPDFWithCertRequest request = new SignPDFWithCertRequest();
        request.setFileInput(pdfFile);
        request.setCertType("PKCS12");
        request.setP12File(p12File);
        request.setPassword("password");
        request.setShowSignature(false);
        request.setReason("test");
        request.setLocation("test");
        request.setName("tester");
        request.setPageNumber(1);
        request.setShowLogo(false);

        ResponseEntity<Resource> response =
                certSignController.signPDFWithCert(request, httpRequest);

        assertNotNull(response.getBody());
        assertTrue(drainBody(response).length > 0);
    }

    @Test
    void testSignPdfWithMissingPkcs12FileThrowsError() {
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        SignPDFWithCertRequest request = new SignPDFWithCertRequest();
        request.setFileInput(pdfFile);
        request.setCertType("PFX");
        request.setPassword("password");
        request.setShowSignature(false);
        request.setReason("test");
        request.setLocation("test");
        request.setName("tester");
        request.setPageNumber(1);
        request.setShowLogo(false);

        IllegalArgumentException exception =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> certSignController.signPDFWithCert(request, httpRequest));

        assertTrue(exception.getMessage().contains("PKCS12 keystore"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"PKCS12", "JKS"})
    void wrongKeystorePasswordIsAnInputError(String certType) {
        SignPDFWithCertRequest request = new SignPDFWithCertRequest();
        request.setFileInput(
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes));
        request.setCertType(certType);
        if ("JKS".equals(certType)) {
            request.setJksFile(
                    new MockMultipartFile("jksFile", "c.jks", "application/x", jksBytes));
        } else {
            request.setP12File(
                    new MockMultipartFile("p12File", "c.p12", "application/x", p12Bytes));
        }
        request.setPassword("not-the-password");

        IllegalArgumentException exception =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> certSignController.signPDFWithCert(request, httpRequest));

        assertTrue(exception.getMessage().contains("password is incorrect"));
    }

    @Test
    void testSignPdfWithJks() throws Exception {
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);
        MockMultipartFile jksFile =
                new MockMultipartFile(
                        "jksFile", "test-cert.jks", "application/octet-stream", jksBytes);

        SignPDFWithCertRequest request = new SignPDFWithCertRequest();
        request.setFileInput(pdfFile);
        request.setCertType("JKS");
        request.setJksFile(jksFile);
        request.setPassword("password");
        request.setShowSignature(false);
        request.setReason("test");
        request.setLocation("test");
        request.setName("tester");
        request.setPageNumber(1);
        request.setShowLogo(false);

        ResponseEntity<Resource> response =
                certSignController.signPDFWithCert(request, httpRequest);

        assertNotNull(response.getBody());
        assertTrue(drainBody(response).length > 0);
    }

    @Test
    void testSignPdfWithPem() throws Exception {
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);
        MockMultipartFile keyFile =
                new MockMultipartFile(
                        "privateKeyFile", "test-key.pem", "application/x-pem-file", pemKeyBytes);
        MockMultipartFile certFile =
                new MockMultipartFile(
                        "certFile", "test-cert.pem", "application/x-pem-file", pemCertBytes);

        SignPDFWithCertRequest request = new SignPDFWithCertRequest();
        request.setFileInput(pdfFile);
        request.setCertType("PEM");
        request.setPrivateKeyFile(keyFile);
        request.setCertFile(certFile);
        request.setPassword("password");
        request.setShowSignature(false);
        request.setReason("test");
        request.setLocation("test");
        request.setName("tester");
        request.setPageNumber(1);
        request.setShowLogo(false);

        ResponseEntity<Resource> response =
                certSignController.signPDFWithCert(request, httpRequest);

        assertNotNull(response.getBody());
        assertTrue(drainBody(response).length > 0);
    }

    @Test
    void testSignPdfWithCrt() throws Exception {
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);
        MockMultipartFile keyFile =
                new MockMultipartFile(
                        "privateKeyFile", "test-key.key", "application/x-pem-file", keyBytes);
        MockMultipartFile certFile =
                new MockMultipartFile(
                        "certFile", "test-cert.crt", "application/x-x509-ca-cert", crtCertBytes);

        SignPDFWithCertRequest request = new SignPDFWithCertRequest();
        request.setFileInput(pdfFile);
        request.setCertType("PEM");
        request.setPrivateKeyFile(keyFile);
        request.setCertFile(certFile);
        request.setPassword("password");
        request.setShowSignature(false);
        request.setReason("test");
        request.setLocation("test");
        request.setName("tester");
        request.setPageNumber(1);
        request.setShowLogo(false);

        ResponseEntity<Resource> response =
                certSignController.signPDFWithCert(request, httpRequest);

        assertNotNull(response.getBody());
        assertTrue(drainBody(response).length > 0);
    }

    @Test
    void testSignPdfWithCer() throws Exception {
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);
        MockMultipartFile keyFile =
                new MockMultipartFile(
                        "privateKeyFile", "test-key.key", "application/x-pem-file", keyBytes);
        MockMultipartFile certFile =
                new MockMultipartFile(
                        "certFile", "test-cert.cer", "application/x-x509-ca-cert", cerCertBytes);

        SignPDFWithCertRequest request = new SignPDFWithCertRequest();
        request.setFileInput(pdfFile);
        request.setCertType("PEM");
        request.setPrivateKeyFile(keyFile);
        request.setCertFile(certFile);
        request.setPassword("password");
        request.setShowSignature(false);
        request.setReason("test");
        request.setLocation("test");
        request.setName("tester");
        request.setPageNumber(1);
        request.setShowLogo(false);

        ResponseEntity<Resource> response =
                certSignController.signPDFWithCert(request, httpRequest);

        assertNotNull(response.getBody());
        assertTrue(drainBody(response).length > 0);
    }

    @Test
    void testSignPdfWithDer() throws Exception {
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);
        MockMultipartFile keyFile =
                new MockMultipartFile(
                        "privateKeyFile", "test-key.key", "application/x-pem-file", keyBytes);
        MockMultipartFile certFile =
                new MockMultipartFile(
                        "certFile", "test-cert.der", "application/x-x509-ca-cert", derCertBytes);

        SignPDFWithCertRequest request = new SignPDFWithCertRequest();
        request.setFileInput(pdfFile);
        request.setCertType("PEM");
        request.setPrivateKeyFile(keyFile);
        request.setCertFile(certFile);
        request.setPassword("password");
        request.setShowSignature(false);
        request.setReason("test");
        request.setLocation("test");
        request.setName("tester");
        request.setPageNumber(1);
        request.setShowLogo(false);

        ResponseEntity<Resource> response =
                certSignController.signPDFWithCert(request, httpRequest);

        assertNotNull(response.getBody());
        assertTrue(drainBody(response).length > 0);
    }

    /** An openssl-style unencrypted PKCS#8 key and a self-signed certificate, as PEM text. */
    private static byte[][] unencryptedPemPair() throws Exception {
        return pemPairWithSubject("CN=Chat Tester");
    }

    /** As {@link #unencryptedPemPair()}, but with the given certificate subject. */
    private static byte[][] pemPairWithSubject(String subjectDn) throws Exception {
        java.security.KeyPairGenerator generator =
                java.security.KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        java.security.KeyPair pair = generator.generateKeyPair();
        org.bouncycastle.asn1.x500.X500Name subject =
                new org.bouncycastle.asn1.x500.X500Name(subjectDn);
        java.util.Date now = new java.util.Date();
        java.security.cert.X509Certificate cert =
                new org.bouncycastle.cert.jcajce.JcaX509CertificateConverter()
                        .getCertificate(
                                new org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder(
                                                subject,
                                                java.math.BigInteger.ONE,
                                                now,
                                                new java.util.Date(now.getTime() + 86_400_000L),
                                                subject,
                                                pair.getPublic())
                                        .build(
                                                new org.bouncycastle.operator.jcajce
                                                                .JcaContentSignerBuilder(
                                                                "SHA256withRSA")
                                                        .build(pair.getPrivate())));
        return new byte[][] {
            pem("PRIVATE KEY", pair.getPrivate().getEncoded()),
            pem("CERTIFICATE", cert.getEncoded())
        };
    }

    private static byte[] pem(String type, byte[] der) throws Exception {
        java.io.StringWriter text = new java.io.StringWriter();
        try (org.bouncycastle.util.io.pem.PemWriter writer =
                new org.bouncycastle.util.io.pem.PemWriter(text)) {
            writer.writeObject(new org.bouncycastle.util.io.pem.PemObject(type, der));
        }
        return text.toString().getBytes(java.nio.charset.StandardCharsets.US_ASCII);
    }

    private SignPDFWithCertRequest unencryptedPemRequest() throws Exception {
        return pemRequestWithSubject("CN=Chat Tester");
    }

    private SignPDFWithCertRequest pemRequestWithSubject(String subjectDn) throws Exception {
        byte[][] pemPair = pemPairWithSubject(subjectDn);
        SignPDFWithCertRequest request = new SignPDFWithCertRequest();
        request.setFileInput(
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes));
        request.setCertType("PEM");
        request.setPrivateKeyFile(
                new MockMultipartFile("privateKeyFile", "key.pem", "text/plain", pemPair[0]));
        request.setCertFile(
                new MockMultipartFile("certFile", "cert.pem", "text/plain", pemPair[1]));
        request.setShowLogo(false);
        return request;
    }

    @Test
    void unencryptedPkcs8KeyWithNoPasswordSignsWithAVisibleBoxAndNoReason() throws Exception {
        SignPDFWithCertRequest request = unencryptedPemRequest();
        request.setShowSignature(true);
        request.setPageNumber(1);

        ResponseEntity<Resource> response =
                certSignController.signPDFWithCert(request, httpRequest);

        assertTrue(drainBody(response).length > 0);
    }

    @Test
    void visibleSignatureOnAPageThatDoesNotExistIsAClearError() throws Exception {
        SignPDFWithCertRequest request = unencryptedPemRequest();
        request.setShowSignature(true);
        request.setPageNumber(5);

        IllegalArgumentException error =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> certSignController.signPDFWithCert(request, httpRequest));
        assertTrue(error.getMessage().contains("pageNumber 5"), error.getMessage());
    }

    @Test
    void visibleSignatureWithCertificateWithoutCnFallsBackToSubject() throws Exception {
        SignPDFWithCertRequest request =
                pemRequestWithSubject("O=Test Organisation, SERIALNUMBER=12345");
        request.setShowSignature(true);
        request.setPageNumber(1);

        ResponseEntity<Resource> response =
                certSignController.signPDFWithCert(request, httpRequest);

        assertNotNull(response.getBody());
        assertTrue(drainBody(response).length > 0);
    }

    @Test
    void fallbackSignerNameFitsInsideSignatureBox() throws Exception {
        X509Certificate cert =
                certificateWithSubject("O=Test Organisation, SERIALNUMBER=12345");
        String label = "Signed by " + CertSignController.CreateSignature.getSignerName(cert);
        PDFont font = new PDType1Font(Standard14Fonts.FontName.TIMES_BOLD);
        float fitted = CertSignController.CreateSignature.fitSignerFontSize(font, label, 10, 190);
        assertTrue(fitted < 10, "fallback label is wider than the box at 10pt, so it must shrink");
        assertTrue(
                WidthCalculator.calculateAccurateWidth(font, label, fitted) <= 190,
                "fitted label must fit inside the 190-point text area");
    }

    @Test
    void visibleSignatureWithNonLatinFallbackSubjectSignsSuccessfully() throws Exception {
        SignPDFWithCertRequest request = pemRequestWithSubject("O=株式会社");
        request.setShowSignature(true);
        request.setPageNumber(1);

        ResponseEntity<Resource> response =
                certSignController.signPDFWithCert(request, httpRequest);

        assertNotNull(response.getBody());
        assertTrue(drainBody(response).length > 0);
    }

    @Test
    void signatureFontFallsBackToEmbeddedFontForNonLatinNames() throws Exception {
        String label = "Signed by O=株式会社";
        try (PDDocument doc = new PDDocument()) {
            PDFont latinFont =
                    CertSignController.CreateSignature.resolveSignatureFont(
                            doc, "Signed by Test Organisation");
            assertEquals("Times-Bold", latinFont.getName());

            PDFont font =
                    CertSignController.CreateSignature.resolveSignatureFont(doc, label);
            assertTrue(
                    TextEncodingHelper.canEncodeCharacters(font, label),
                    "resolved font must encode the non-Latin label");
            assertTrue(
                    !"Times-Bold".equals(font.getName()),
                    "non-Latin label must not use Times Bold");
        }
    }

    @Test
    void signerNameWithCommaInCommonNameIsNotEscaped() throws Exception {
        X509Certificate cert = certificateWithSubject("CN=García\\, Ana");

        assertEquals("García, Ana", CertSignController.CreateSignature.getSignerName(cert));
    }

    private static X509Certificate certificateWithSubject(String subjectDn) throws Exception {
        byte[][] pemPair = pemPairWithSubject(subjectDn);
        return (X509Certificate)
                CertificateFactory.getInstance("X.509")
                        .generateCertificate(new ByteArrayInputStream(pemPair[1]));
    }

    @Test
    void testSignPdfWithUnencryptedPkcs8PemKey() throws Exception {
        ResponseEntity<Resource> response =
                signWithPemKey(
                        "test-key-pkcs8.pem", readResource("certs/test-key-pkcs8.pem"), "password");

        assertSignedByTestCert(response);
    }

    @Test
    void testSignPdfWithUnencryptedPkcs8PemKeyAndNoPassword() throws Exception {
        ResponseEntity<Resource> response =
                signWithPemKey(
                        "test-key-pkcs8.pem", readResource("certs/test-key-pkcs8.pem"), null);

        assertSignedByTestCert(response);
    }

    @Test
    void testSignPdfWithTraditionalRsaPemKey() throws Exception {
        ResponseEntity<Resource> response =
                signWithPemKey(
                        "test-key-traditional.pem",
                        readResource("certs/test-key-traditional.pem"),
                        "password");

        assertSignedByTestCert(response);
    }

    @Test
    void testSignPdfWithCertificateAsPemKeyThrowsError() {
        IllegalArgumentException exception =
                assertThrows(
                        IllegalArgumentException.class,
                        () -> signWithPemKey("test-cert.pem", pemCertBytes, "password"));

        assertTrue(exception.getMessage().contains("PEM private key"));
    }

    private ResponseEntity<Resource> signWithPemKey(
            String keyFileName, byte[] keyFileBytes, String password) throws Exception {
        SignPDFWithCertRequest request = new SignPDFWithCertRequest();
        request.setFileInput(
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes));
        request.setCertType("PEM");
        request.setPrivateKeyFile(
                new MockMultipartFile(
                        "privateKeyFile", keyFileName, "application/x-pem-file", keyFileBytes));
        request.setCertFile(
                new MockMultipartFile(
                        "certFile", "test-cert.pem", "application/x-pem-file", pemCertBytes));
        request.setPassword(password);
        request.setShowSignature(false);
        request.setReason("test");
        request.setLocation("test");
        request.setName("tester");
        request.setPageNumber(1);
        request.setShowLogo(false);
        return certSignController.signPDFWithCert(request, httpRequest);
    }

    // A key that doesn't match the certificate still yields a signed PDF, so check the CMS
    // signature itself against test-cert.pem.
    private void assertSignedByTestCert(ResponseEntity<Resource> response) throws Exception {
        assertNotNull(response.getBody());
        byte[] signedPdf = drainBody(response);
        X509Certificate cert =
                (X509Certificate)
                        CertificateFactory.getInstance("X.509")
                                .generateCertificate(new ByteArrayInputStream(pemCertBytes));
        try (PDDocument doc = Loader.loadPDF(signedPdf)) {
            PDSignature signature = doc.getLastSignatureDictionary();
            assertNotNull(signature);
            CMSSignedData cms =
                    new CMSSignedData(
                            new CMSProcessableByteArray(signature.getSignedContent(signedPdf)),
                            new ByteArrayInputStream(signature.getContents(signedPdf)));
            SignerInformation signer = cms.getSignerInfos().getSigners().iterator().next();
            assertTrue(signer.verify(new JcaSimpleSignerInfoVerifierBuilder().build(cert)));
        }
    }

    private static byte[] readResource(String path) throws java.io.IOException {
        try (InputStream is = new ClassPathResource(path).getInputStream()) {
            return is.readAllBytes();
        }
    }
}
