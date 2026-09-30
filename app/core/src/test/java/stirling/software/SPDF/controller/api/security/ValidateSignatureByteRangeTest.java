package stirling.software.SPDF.controller.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayOutputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.Arrays;
import java.util.Calendar;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.bouncycastle.cert.jcajce.JcaCertStore;
import org.bouncycastle.cms.CMSProcessableByteArray;
import org.bouncycastle.cms.CMSSignedDataGenerator;
import org.bouncycastle.cms.jcajce.JcaSignerInfoGeneratorBuilder;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.bouncycastle.operator.jcajce.JcaDigestCalculatorProviderBuilder;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.security.SignatureValidationRequest;
import stirling.software.SPDF.model.api.security.SignatureValidationResult;
import stirling.software.SPDF.service.CertificateValidationService;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.util.ExceptionUtils.PdfPasswordException;

/** Signature validation reads the signed ByteRange from the upload as signed (e.g. e-Aadhaar). */
@DisplayName("Signature validation over the uploaded bytes")
class ValidateSignatureByteRangeTest {

    private static final char[] KEYSTORE_PASSWORD = "password".toCharArray();
    private static final String USER_PASSWORD = "user-pass";

    private static PrivateKey privateKey;
    private static Certificate[] chain;

    private ValidateSignatureController controller;

    @BeforeAll
    static void loadKeys() throws Exception {
        KeyStore ks = KeyStore.getInstance("PKCS12");
        try (InputStream is = new ClassPathResource("certs/test-cert.p12").getInputStream()) {
            ks.load(is, KEYSTORE_PASSWORD);
        }
        String alias = ks.aliases().nextElement();
        privateKey = (PrivateKey) ks.getKey(alias, KEYSTORE_PASSWORD);
        chain = ks.getCertificateChain(alias);
    }

    @BeforeEach
    void setUp() {
        PdfMetadataService metadata =
                new PdfMetadataService(new ApplicationProperties(), "Stirling-PDF", false, null);
        controller =
                new ValidateSignatureController(
                        new CustomPDFDocumentFactory(metadata),
                        new CertificateValidationService(null, new ApplicationProperties()));
    }

    @Nested
    @DisplayName("Password-protected signed PDF, e-Aadhaar shape")
    class EncryptedThenSigned {

        @Test
        @DisplayName("the original file with its password validates")
        void originalWithPasswordIsValid() throws Exception {
            byte[] signed = sign(encrypted(USER_PASSWORD), USER_PASSWORD, false);

            SignatureValidationResult result = validate(upload(signed), USER_PASSWORD);

            assertThat(result.getErrorMessage()).isNull();
            assertThat(result.isValid()).isTrue();
            assertThat(result.isCoversEntireDocument()).isTrue();
        }

        @Test
        @DisplayName("without a password it is a password-required error")
        void originalWithoutPasswordNeedsPassword() throws Exception {
            byte[] signed = sign(encrypted(USER_PASSWORD), USER_PASSWORD, false);

            assertThatThrownBy(() -> validate(upload(signed), null))
                    .isInstanceOf(PdfPasswordException.class)
                    .hasMessageNotContaining(USER_PASSWORD);
            assertThatThrownBy(() -> validate(upload(signed), "wrong-pass"))
                    .isInstanceOf(PdfPasswordException.class)
                    .hasMessageNotContaining("wrong-pass");
        }

        @Test
        @DisplayName("an unlocked re-save reports modified after signing, not a skip() error")
        void unlockedCopyIsModifiedAfterSigning() throws Exception {
            byte[] signed = sign(encrypted(USER_PASSWORD), USER_PASSWORD, false);
            byte[] unlocked;
            try (PDDocument doc = Loader.loadPDF(signed, USER_PASSWORD)) {
                doc.setAllSecurityToBeRemoved(true);
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                doc.save(out);
                unlocked = out.toByteArray();
            }

            SignatureValidationResult result = validate(upload(unlocked), null);

            assertThat(result.isValid()).isFalse();
            assertThat(result.getErrorMessage())
                    .doesNotContain("skip()")
                    .contains("modified after it was signed");
        }
    }

    @Test
    @DisplayName("an upload stream whose skip() returns 0 still validates")
    void validatesWhenUploadStreamSkipReturnsZero() throws Exception {
        byte[] signed = sign(plain(), "", false);
        MockMultipartFile upload =
                new MockMultipartFile("fileInput", "signed.pdf", "application/pdf", signed) {
                    @Override
                    public InputStream getInputStream() throws IOException {
                        return new ZeroSkipInputStream(super.getInputStream());
                    }
                };

        SignatureValidationResult result = validate(upload, null);

        assertThat(result.getErrorMessage()).isNull();
        assertThat(result.isValid()).isTrue();
    }

    @Test
    @DisplayName("adbe.pkcs7.sha1 verifies against the SHA-1 digest of the byte range")
    void adbePkcs7Sha1SignatureValidates() throws Exception {
        byte[] signed = sign(plain(), "", true);

        SignatureValidationResult result = validate(upload(signed), null);

        assertThat(result.getErrorMessage()).isNull();
        assertThat(result.isValid()).isTrue();
    }

    @Test
    @DisplayName("adbe.pkcs7.sha1 still detects a changed byte")
    void adbePkcs7Sha1SignatureDetectsTampering() throws Exception {
        byte[] signed = sign(plain(), "", true);
        // Inside the binary header comment, so the file still parses.
        signed[10] ^= 0x01;

        SignatureValidationResult result = validate(upload(signed), null);

        assertThat(result.isValid()).isFalse();
    }

    @Test
    @DisplayName("extractSignedContent concatenates ranges and rejects ones off the file")
    void extractSignedContentConcatenatesRangesAndRejectsBadOnes() throws Exception {
        byte[] file = "0123456789".getBytes();

        assertThat(ValidateSignatureController.extractSignedContent(new int[] {0, 3, 7, 3}, file))
                .isEqualTo("012789".getBytes());
        assertThatThrownBy(
                        () ->
                                ValidateSignatureController.extractSignedContent(
                                        new int[] {0, 3, 7, 4}, file))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("does not fit");
        assertThatThrownBy(
                        () ->
                                ValidateSignatureController.extractSignedContent(
                                        new int[] {-1, 3, 7, 3}, file))
                .isInstanceOf(IOException.class);
        assertThatThrownBy(() -> ValidateSignatureController.extractSignedContent(null, file))
                .isInstanceOf(IOException.class);
    }

    private SignatureValidationResult validate(MockMultipartFile file, String password)
            throws IOException {
        SignatureValidationRequest request = new SignatureValidationRequest();
        request.setFileInput(file);
        request.setDocumentPassword(password);
        List<SignatureValidationResult> results = controller.validateSignature(request).getBody();
        assertThat(results).hasSize(1);
        return results.get(0);
    }

    private static MockMultipartFile upload(byte[] pdf) {
        return new MockMultipartFile("fileInput", "signed.pdf", "application/pdf", pdf);
    }

    private static byte[] plain() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return out.toByteArray();
        }
    }

    private static byte[] encrypted(String userPassword) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < 20; i++) {
                doc.addPage(new PDPage());
            }
            StandardProtectionPolicy policy =
                    new StandardProtectionPolicy(
                            "owner-pass", userPassword, new AccessPermission());
            policy.setEncryptionKeyLength(128);
            doc.protect(policy);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return out.toByteArray();
        }
    }

    /** Signs {@code base} as an incremental update, opening it with {@code password}. */
    private static byte[] sign(byte[] base, String password, boolean sha1SubFilter)
            throws Exception {
        COSName subFilter =
                sha1SubFilter
                        ? PDSignature.SUBFILTER_ADBE_PKCS7_SHA1
                        : PDSignature.SUBFILTER_ADBE_PKCS7_DETACHED;
        try (PDDocument doc = Loader.loadPDF(base, password)) {
            PDSignature signature = new PDSignature();
            signature.setFilter(PDSignature.FILTER_ADOBE_PPKLITE);
            signature.setSubFilter(subFilter);
            signature.setName("Test Signer");
            signature.setSignDate(Calendar.getInstance());
            doc.addSignature(
                    signature,
                    content -> {
                        try {
                            byte[] data = content.readAllBytes();
                            // adbe.pkcs7.sha1 encapsulates the SHA-1 digest of the byte range.
                            byte[] signedData =
                                    sha1SubFilter
                                            ? MessageDigest.getInstance("SHA-1").digest(data)
                                            : data;
                            CMSSignedDataGenerator gen = new CMSSignedDataGenerator();
                            gen.addSignerInfoGenerator(
                                    new JcaSignerInfoGeneratorBuilder(
                                                    new JcaDigestCalculatorProviderBuilder()
                                                            .build())
                                            .build(
                                                    new JcaContentSignerBuilder("SHA256WithRSA")
                                                            .build(privateKey),
                                                    (X509Certificate) chain[0]));
                            gen.addCertificates(new JcaCertStore(Arrays.asList(chain)));
                            return gen.generate(
                                            new CMSProcessableByteArray(signedData), sha1SubFilter)
                                    .getEncoded();
                        } catch (Exception e) {
                            throw new IOException(e);
                        }
                    });
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.saveIncremental(out);
            return out.toByteArray();
        }
    }

    /** Legal per the InputStream contract; PDFBox's skip-based reads failed on it. */
    private static final class ZeroSkipInputStream extends FilterInputStream {
        ZeroSkipInputStream(InputStream in) {
            super(in);
        }

        @Override
        public long skip(long n) {
            return 0;
        }
    }
}
