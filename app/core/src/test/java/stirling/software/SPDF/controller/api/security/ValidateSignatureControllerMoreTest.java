package stirling.software.SPDF.controller.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Security;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.SignatureInterface;
import org.bouncycastle.cert.jcajce.JcaCertStore;
import org.bouncycastle.cms.CMSProcessableByteArray;
import org.bouncycastle.cms.CMSSignedData;
import org.bouncycastle.cms.CMSSignedDataGenerator;
import org.bouncycastle.cms.jcajce.JcaSignerInfoGeneratorBuilder;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.bouncycastle.operator.jcajce.JcaDigestCalculatorProviderBuilder;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.security.SignatureValidationRequest;
import stirling.software.SPDF.model.api.security.SignatureValidationResult;
import stirling.software.SPDF.service.CertificateValidationService;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;

/**
 * Exercises the full per-signature loop of {@link ValidateSignatureController} against a real,
 * runtime-signed PDF. Uses a real {@link CertificateValidationService} so the path-building,
 * validity, revocation and metadata branches actually execute. No network is ever contacted.
 */
@DisplayName("ValidateSignatureController (more) Tests")
class ValidateSignatureControllerMoreTest {

    private static final char[] PASSWORD = "password".toCharArray();

    private CustomPDFDocumentFactory pdfDocumentFactory;
    private CertificateValidationService certValidationService;
    private ValidateSignatureController controller;

    private X509Certificate testCert;
    private byte[] testCertDer;
    private byte[] signedPdfBytes;

    @BeforeAll
    static void registerBc() {
        if (Security.getProvider("BC") == null) {
            Security.addProvider(new BouncyCastleProvider());
        }
    }

    @BeforeEach
    void setUp() throws Exception {
        // Real service backed by real (default) ApplicationProperties: revocation "none",
        // no trust anchors loaded since @PostConstruct is not invoked here.
        ApplicationProperties props = new ApplicationProperties();
        certValidationService = new CertificateValidationService(null, props);

        // Mock only the document factory; delegate load() to the real PDFBox loader so signature
        // dictionaries are parsed exactly as in production.
        pdfDocumentFactory = org.mockito.Mockito.mock(CustomPDFDocumentFactory.class);

        controller = new ValidateSignatureController(pdfDocumentFactory, certValidationService);

        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (InputStream is = new ClassPathResource("certs/test-cert.p12").getInputStream()) {
            ks.load(is, PASSWORD);
        }
        String alias = ks.aliases().nextElement();
        PrivateKey privateKey = (PrivateKey) ks.getKey(alias, PASSWORD);
        Certificate[] chain = ks.getCertificateChain(alias);
        testCert = (X509Certificate) chain[0];
        testCertDer = testCert.getEncoded();

        signedPdfBytes = createSignedPdf(privateKey, chain);
    }

    /** Build a single-page PDF and apply a detached PKCS7 signature with the test certificate. */
    private static byte[] createSignedPdf(PrivateKey privateKey, Certificate[] chain)
            throws Exception {
        byte[] base;
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            base = baos.toByteArray();
        }

        X509Certificate signer = (X509Certificate) chain[0];
        SignatureInterface signatureInterface =
                content -> {
                    try {
                        byte[] data = content.readAllBytes();
                        List<Certificate> certList = new ArrayList<>(Arrays.asList(chain));
                        JcaCertStore certs = new JcaCertStore(certList);
                        CMSSignedDataGenerator gen = new CMSSignedDataGenerator();
                        gen.addSignerInfoGenerator(
                                new JcaSignerInfoGeneratorBuilder(
                                                new JcaDigestCalculatorProviderBuilder().build())
                                        .build(
                                                new JcaContentSignerBuilder("SHA256WithRSA")
                                                        .build(privateKey),
                                                signer));
                        gen.addCertificates(certs);
                        CMSSignedData signedData =
                                gen.generate(new CMSProcessableByteArray(data), false);
                        return signedData.getEncoded();
                    } catch (Exception e) {
                        throw new IOException(e);
                    }
                };

        try (PDDocument doc = Loader.loadPDF(base)) {
            PDSignature signature = new PDSignature();
            signature.setFilter(PDSignature.FILTER_ADOBE_PPKLITE);
            signature.setSubFilter(PDSignature.SUBFILTER_ADBE_PKCS7_DETACHED);
            signature.setName("Test Signer");
            signature.setReason("unit-test-reason");
            signature.setLocation("unit-test-location");
            signature.setSignDate(Calendar.getInstance());
            doc.addSignature(signature, signatureInterface);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.saveIncremental(out);
            return out.toByteArray();
        }
    }

    private MockMultipartFile signedPdfMultipart() {
        return new MockMultipartFile(
                "fileInput", "signed.pdf", MediaType.APPLICATION_PDF_VALUE, signedPdfBytes);
    }

    @Nested
    @DisplayName("Signed PDF with untrusted self-signed certificate")
    class UntrustedSignerTests {

        @Test
        @DisplayName("Recognizes the signature and reports CMS valid but chain untrusted")
        void validatesSignatureWithoutTrustAnchor() throws Exception {
            SignatureValidationRequest request = new SignatureValidationRequest();
            request.setFileInput(signedPdfMultipart());

            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenAnswer(inv -> Loader.loadPDF(signedPdfBytes));

            ResponseEntity<List<SignatureValidationResult>> response =
                    controller.validateSignature(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).hasSize(1);

            SignatureValidationResult result = response.getBody().get(0);
            // Cryptographic signature is valid even though the chain has no trust anchor.
            assertThat(result.isValid()).isTrue();
            // No anchors are loaded (PostConstruct not run, no custom cert) -> chain fails.
            assertThat(result.isChainValid()).isFalse();
            assertThat(result.isTrustValid()).isFalse();
            assertThat(result.getChainValidationError()).isNotNull();
        }

        @Test
        @DisplayName("Populates certificate metadata fields from the signer certificate")
        void populatesCertificateMetadata() throws Exception {
            SignatureValidationRequest request = new SignatureValidationRequest();
            request.setFileInput(signedPdfMultipart());

            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenAnswer(inv -> Loader.loadPDF(signedPdfBytes));

            SignatureValidationResult result =
                    controller.validateSignature(request).getBody().get(0);

            assertThat(result.getSubjectDN()).contains("CN=Test");
            assertThat(result.getIssuerDN()).contains("CN=Test");
            assertThat(result.getSerialNumber()).isNotBlank();
            assertThat(result.getValidFrom()).isNotBlank();
            assertThat(result.getValidUntil()).isNotBlank();
            assertThat(result.getSignatureAlgorithm()).isEqualTo("SHA256withRSA");
            assertThat(result.getVersion()).isEqualTo("3");
            // RSA 2048-bit key in the test certificate.
            assertThat(result.getKeySize()).isEqualTo(2048);
            // Self-signed test CA certificate.
            assertThat(result.isSelfSigned()).isTrue();
        }

        @Test
        @DisplayName("Sets signature dictionary metadata (name, reason, location)")
        void populatesSignatureDictionaryMetadata() throws Exception {
            SignatureValidationRequest request = new SignatureValidationRequest();
            request.setFileInput(signedPdfMultipart());

            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenAnswer(inv -> Loader.loadPDF(signedPdfBytes));

            SignatureValidationResult result =
                    controller.validateSignature(request).getBody().get(0);

            assertThat(result.getSignerName()).isEqualTo("Test Signer");
            assertThat(result.getReason()).isEqualTo("unit-test-reason");
            assertThat(result.getLocation()).isEqualTo("unit-test-location");
            assertThat(result.getSignatureDate()).isNotNull();
        }

        @Test
        @DisplayName("With revocation mode 'none' reports revocation not-checked")
        void reportsRevocationNotChecked() throws Exception {
            SignatureValidationRequest request = new SignatureValidationRequest();
            request.setFileInput(signedPdfMultipart());

            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenAnswer(inv -> Loader.loadPDF(signedPdfBytes));

            SignatureValidationResult result =
                    controller.validateSignature(request).getBody().get(0);

            assertThat(result.isRevocationChecked()).isFalse();
            assertThat(result.getRevocationStatus()).isEqualTo("not-checked");
        }

        @Test
        @DisplayName("Uses signing-time as validation time source when no timestamp token")
        void usesValidationTimeSource() throws Exception {
            SignatureValidationRequest request = new SignatureValidationRequest();
            request.setFileInput(signedPdfMultipart());

            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenAnswer(inv -> Loader.loadPDF(signedPdfBytes));

            SignatureValidationResult result =
                    controller.validateSignature(request).getBody().get(0);

            // Detached CMS without signed attrs falls back to current time.
            assertThat(result.getValidationTimeSource()).isIn("signing-time", "current");
            // Test cert is valid for ~1 year from creation, so not expired now.
            assertThat(result.isNotExpired()).isTrue();
        }
    }

    @Nested
    @DisplayName("Signed PDF with matching custom trust anchor")
    class TrustedAnchorTests {

        @Test
        @DisplayName("Custom cert that equals the signer yields a valid trusted chain")
        void chainValidWhenCustomCertIsTheAnchor() throws Exception {
            MockMultipartFile certFile =
                    new MockMultipartFile(
                            "certFile", "test-cert.der", "application/pkix-cert", testCertDer);

            SignatureValidationRequest request = new SignatureValidationRequest();
            request.setFileInput(signedPdfMultipart());
            request.setCertFile(certFile);

            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenAnswer(inv -> Loader.loadPDF(signedPdfBytes));

            SignatureValidationResult result =
                    controller.validateSignature(request).getBody().get(0);

            assertThat(result.isValid()).isTrue();
            assertThat(result.isChainValid()).isTrue();
            assertThat(result.isTrustValid()).isTrue();
            assertThat(result.getChainValidationError()).isNull();
            // Self-signed anchor == signer, so the path has zero intermediate certificates.
            assertThat(result.getCertPathLength()).isGreaterThanOrEqualTo(0);
        }
    }

    @Nested
    @DisplayName("Error and edge handling")
    class ErrorHandlingTests {

        @Test
        @DisplayName("Invalid certificate file content throws a runtime exception")
        void invalidCertFileThrows() throws Exception {
            MockMultipartFile certFile =
                    new MockMultipartFile(
                            "certFile",
                            "bad.pem",
                            "application/x-pem-file",
                            "this is not a certificate".getBytes());

            SignatureValidationRequest request = new SignatureValidationRequest();
            request.setFileInput(signedPdfMultipart());
            request.setCertFile(certFile);

            assertThrows(RuntimeException.class, () -> controller.validateSignature(request));
        }

        @Test
        @DisplayName("IOException from the document factory propagates")
        void ioExceptionPropagates() throws Exception {
            SignatureValidationRequest request = new SignatureValidationRequest();
            request.setFileInput(signedPdfMultipart());

            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenThrow(new IOException("boom"));

            assertThrows(IOException.class, () -> controller.validateSignature(request));
        }

        @Test
        @DisplayName("Unsigned PDF yields an empty result list")
        void unsignedPdfYieldsEmptyResults() throws Exception {
            byte[] unsigned;
            try (PDDocument doc = new PDDocument()) {
                doc.addPage(new PDPage());
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                doc.save(baos);
                unsigned = baos.toByteArray();
            }
            MockMultipartFile pdfFile =
                    new MockMultipartFile(
                            "fileInput", "plain.pdf", MediaType.APPLICATION_PDF_VALUE, unsigned);
            SignatureValidationRequest request = new SignatureValidationRequest();
            request.setFileInput(pdfFile);

            byte[] unsignedCopy = unsigned;
            when(pdfDocumentFactory.load(any(InputStream.class)))
                    .thenAnswer(inv -> Loader.loadPDF(unsignedCopy));

            ResponseEntity<List<SignatureValidationResult>> response =
                    controller.validateSignature(request);

            assertThat(response.getBody()).isEmpty();
        }
    }
}
