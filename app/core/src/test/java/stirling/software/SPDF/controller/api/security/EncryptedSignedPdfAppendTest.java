package stirling.software.SPDF.controller.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.Security;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Set;

import javax.security.auth.x500.X500Principal;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.encryption.AccessPermission;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.apache.pdfbox.pdmodel.encryption.StandardProtectionPolicy;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceStream;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;
import org.apache.pdfbox.text.PDFTextStripper;
import org.bouncycastle.asn1.ASN1ObjectIdentifier;
import org.bouncycastle.asn1.nist.NISTObjectIdentifiers;
import org.bouncycastle.asn1.oiw.OIWObjectIdentifiers;
import org.bouncycastle.asn1.x509.AlgorithmIdentifier;
import org.bouncycastle.asn1.x509.ExtendedKeyUsage;
import org.bouncycastle.asn1.x509.Extension;
import org.bouncycastle.asn1.x509.KeyPurposeId;
import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cert.jcajce.JcaCertStore;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.cms.CMSProcessableByteArray;
import org.bouncycastle.cms.CMSSignedData;
import org.bouncycastle.cms.CMSSignedDataGenerator;
import org.bouncycastle.cms.SignerInformation;
import org.bouncycastle.cms.jcajce.JcaSignerInfoGeneratorBuilder;
import org.bouncycastle.cms.jcajce.JcaSimpleSignerInfoVerifierBuilder;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.bouncycastle.operator.jcajce.JcaDigestCalculatorProviderBuilder;
import org.bouncycastle.tsp.TimeStampRequest;
import org.bouncycastle.tsp.TimeStampResponseGenerator;
import org.bouncycastle.tsp.TimeStampToken;
import org.bouncycastle.tsp.TimeStampTokenGenerator;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import jakarta.servlet.http.HttpServletRequest;

import stirling.software.SPDF.model.api.security.SignPDFWithCertRequest;
import stirling.software.SPDF.model.api.security.SignatureValidationRequest;
import stirling.software.SPDF.model.api.security.SignatureValidationResult;
import stirling.software.SPDF.model.api.security.TimestampPdfRequest;
import stirling.software.SPDF.service.CertificateValidationService;
import stirling.software.SPDF.service.HardwareKeyStoreService;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.util.ExceptionUtils.PdfPasswordException;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

import okhttp3.mockwebserver.Dispatcher;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import okio.Buffer;

/**
 * Cert-sign and timestamp on PDFs encrypted before signing (e.g. e-Aadhaar) must append an
 * encrypted increment that keeps every signature valid. Real factory and PDFBox; local TSA.
 */
@DisplayName("Appending signatures to encrypted, already-signed PDFs")
class EncryptedSignedPdfAppendTest {

    private static final String USER_PASSWORD = "user-pass";
    private static final char[] KEYSTORE_PASSWORD = "password".toCharArray();
    private static final String PAGE_TEXT = "Encrypted then signed";
    private static final int PAGE_COUNT = 3;

    private static PrivateKey signerKey;
    private static Certificate[] signerChain;
    private static byte[] p12Bytes;
    private static KeyPair tsaKeyPair;
    private static X509Certificate tsaCert;

    private final List<Path> tempFiles = new ArrayList<>();
    private CustomPDFDocumentFactory factory;
    private TempFileManager tempFileManager;
    private ValidateSignatureController validator;
    private MockWebServer tsa;

    enum Encryption {
        RC4_128(128, false),
        AES_128(128, true),
        AES_256(256, true);

        final int keyLength;
        final boolean preferAes;

        Encryption(int keyLength, boolean preferAes) {
            this.keyLength = keyLength;
            this.preferAes = preferAes;
        }
    }

    @BeforeAll
    static void loadKeys() throws Exception {
        if (Security.getProvider("BC") == null) {
            Security.addProvider(new BouncyCastleProvider());
        }
        try (InputStream is = new ClassPathResource("certs/test-cert.p12").getInputStream()) {
            p12Bytes = is.readAllBytes();
        }
        KeyStore ks = KeyStore.getInstance("PKCS12");
        ks.load(new ByteArrayInputStream(p12Bytes), KEYSTORE_PASSWORD);
        String alias = ks.aliases().nextElement();
        signerKey = (PrivateKey) ks.getKey(alias, KEYSTORE_PASSWORD);
        signerChain = ks.getCertificateChain(alias);

        KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
        kpg.initialize(2048);
        tsaKeyPair = kpg.generateKeyPair();
        tsaCert = tsaCertificate(tsaKeyPair);
    }

    @BeforeEach
    void setUp() throws Exception {
        PdfMetadataService metadata =
                new PdfMetadataService(new ApplicationProperties(), "Stirling-PDF", false, null);
        factory = new CustomPDFDocumentFactory(metadata);
        tempFileManager = mock(TempFileManager.class);
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("append", inv.<String>getArgument(0))
                                            .toFile();
                            tempFiles.add(f.toPath());
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
        validator =
                new ValidateSignatureController(
                        factory,
                        new CertificateValidationService(null, new ApplicationProperties()));
    }

    @AfterEach
    void tearDown() throws IOException {
        if (tsa != null) {
            tsa.shutdown();
        }
        for (Path p : tempFiles) {
            Files.deleteIfExists(p);
        }
    }

    @Nested
    @DisplayName("Sign with Certificate")
    class CertSign {

        @ParameterizedTest(name = "{0}")
        @EnumSource(Encryption.class)
        @DisplayName("keeps the first signature valid and the result locked with its password")
        void secondSignatureOnEncryptedSignedPdf(Encryption encryption) throws Exception {
            byte[] original = encryptedThenSigned(USER_PASSWORD, encryption);

            byte[] result = certSign(original, USER_PASSWORD, false);

            assertAppendedOnto(original, result);
            assertStillLocked(result, USER_PASSWORD);
            assertEverySignatureVerifies(result, USER_PASSWORD, 2);
            assertValidatorAccepts(result, USER_PASSWORD, 2);
        }

        @Test
        @DisplayName("a visible signature adds encrypted appearance objects")
        void visibleSignatureOnEncryptedSignedPdf() throws Exception {
            byte[] original = encryptedThenSigned(USER_PASSWORD, Encryption.AES_128);

            byte[] result = certSign(original, USER_PASSWORD, true);

            assertAppendedOnto(original, result);
            assertStillLocked(result, USER_PASSWORD);
            assertEverySignatureVerifies(result, USER_PASSWORD, 2);
            assertValidatorAccepts(result, USER_PASSWORD, 2);
            // Read through the decryptor: bytes written in the clear would decrypt to noise.
            try (PDDocument doc = Loader.loadPDF(result, USER_PASSWORD)) {
                PDSignatureField field =
                        doc.getSignatureFields().stream()
                                .filter(f -> "Second signer".equals(f.getSignature().getName()))
                                .findFirst()
                                .orElseThrow();
                PDAnnotationWidget widget = field.getWidgets().get(0);
                PDAppearanceStream appearance =
                        widget.getAppearance().getNormalAppearance().getAppearanceStream();
                assertThat(operatorNames(appearance)).contains("BT", "Tj", "ET");
            }
        }

        @Test
        @DisplayName("an owner-password-only PDF needs no password and stays encrypted")
        void ownerOnlyEncryptedSignedPdf() throws Exception {
            byte[] original = encryptedThenSigned("", Encryption.AES_128);

            byte[] result = certSign(original, null, false);

            assertAppendedOnto(original, result);
            try (PDDocument doc = Loader.loadPDF(result)) {
                assertThat(doc.isEncrypted()).isTrue();
            }
            assertEverySignatureVerifies(result, "", 2);
            assertValidatorAccepts(result, null, 2);
        }

        @Test
        @DisplayName("a missing or wrong password is a password error, not an empty file")
        void wrongPassword() throws Exception {
            byte[] original = encryptedThenSigned(USER_PASSWORD, Encryption.AES_128);

            assertThatThrownBy(() -> certSign(original, "wrong", false))
                    .isInstanceOf(PdfPasswordException.class);
            assertThatThrownBy(() -> certSign(original, null, false))
                    .isInstanceOf(PdfPasswordException.class);
        }
    }

    @Nested
    @DisplayName("Timestamp PDF")
    class Timestamp {

        @ParameterizedTest(name = "{0}")
        @EnumSource(Encryption.class)
        @DisplayName("adds a valid document timestamp and keeps the first signature valid")
        void timestampOnEncryptedSignedPdf(Encryption encryption) throws Exception {
            byte[] original = encryptedThenSigned(USER_PASSWORD, encryption);

            byte[] result = timestamp(original, USER_PASSWORD);

            assertAppendedOnto(original, result);
            assertStillLocked(result, USER_PASSWORD);
            assertEverySignatureVerifies(result, USER_PASSWORD, 2);
            assertValidatorAccepts(result, USER_PASSWORD, 2);
        }

        @Test
        @DisplayName("signing then timestamping keeps all three signatures valid")
        void signThenTimestamp() throws Exception {
            byte[] original = encryptedThenSigned(USER_PASSWORD, Encryption.AES_128);

            byte[] result = timestamp(certSign(original, USER_PASSWORD, false), USER_PASSWORD);

            assertAppendedOnto(original, result);
            assertStillLocked(result, USER_PASSWORD);
            assertEverySignatureVerifies(result, USER_PASSWORD, 3);
            assertValidatorAccepts(result, USER_PASSWORD, 3);
        }

        @Test
        @DisplayName("a wrong password is a password error")
        void wrongPassword() throws Exception {
            byte[] original = encryptedThenSigned(USER_PASSWORD, Encryption.AES_128);

            assertThatThrownBy(() -> timestamp(original, "wrong"))
                    .isInstanceOf(PdfPasswordException.class);
        }
    }

    /** Builds the e-Aadhaar shape: encrypt and save, then sign as an incremental update. */
    private static byte[] encryptedThenSigned(String userPassword, Encryption encryption)
            throws Exception {
        byte[] encrypted;
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < PAGE_COUNT; i++) {
                PDPage page = new PDPage();
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.beginText();
                    cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                    cs.newLineAtOffset(72, 700);
                    cs.showText(PAGE_TEXT);
                    cs.endText();
                }
            }
            StandardProtectionPolicy policy =
                    new StandardProtectionPolicy(
                            "owner-pass", userPassword, new AccessPermission());
            policy.setEncryptionKeyLength(encryption.keyLength);
            policy.setPreferAES(encryption.preferAes);
            doc.protect(policy);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            encrypted = out.toByteArray();
        }
        try (PDDocument doc = Loader.loadPDF(encrypted, userPassword)) {
            PDSignature signature = new PDSignature();
            signature.setFilter(PDSignature.FILTER_ADOBE_PPKLITE);
            signature.setSubFilter(PDSignature.SUBFILTER_ADBE_PKCS7_DETACHED);
            signature.setName("First signer");
            signature.setSignDate(Calendar.getInstance());
            doc.addSignature(signature, EncryptedSignedPdfAppendTest::detachedCms);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.saveIncremental(out);
            return out.toByteArray();
        }
    }

    private static byte[] detachedCms(InputStream content) throws IOException {
        try {
            CMSSignedDataGenerator gen = new CMSSignedDataGenerator();
            gen.addSignerInfoGenerator(
                    new JcaSignerInfoGeneratorBuilder(
                                    new JcaDigestCalculatorProviderBuilder().build())
                            .build(
                                    new JcaContentSignerBuilder("SHA256WithRSA").build(signerKey),
                                    (X509Certificate) signerChain[0]));
            gen.addCertificates(new JcaCertStore(Arrays.asList(signerChain)));
            return gen.generate(new CMSProcessableByteArray(content.readAllBytes()), false)
                    .getEncoded();
        } catch (Exception e) {
            throw new IOException(e);
        }
    }

    private byte[] certSign(byte[] pdf, String documentPassword, boolean visible) throws Exception {
        CertSignController controller =
                new CertSignController(
                        factory, null, tempFileManager, mock(HardwareKeyStoreService.class));
        SignPDFWithCertRequest request = new SignPDFWithCertRequest();
        request.setFileInput(pdfPart(pdf));
        request.setDocumentPassword(documentPassword);
        request.setCertType("PKCS12");
        request.setP12File(
                new MockMultipartFile(
                        "p12File", "test-cert.p12", "application/x-pkcs12", p12Bytes));
        request.setPassword(new String(KEYSTORE_PASSWORD));
        request.setShowSignature(visible);
        request.setPageNumber(1);
        request.setShowLogo(false);
        request.setName("Second signer");
        request.setReason("approval");
        request.setLocation("test");
        return body(controller.signPDFWithCert(request, mock(HttpServletRequest.class)));
    }

    private byte[] timestamp(byte[] pdf, String documentPassword) throws Exception {
        if (tsa == null) {
            tsa = new MockWebServer();
            tsa.setDispatcher(
                    new Dispatcher() {
                        @Override
                        public MockResponse dispatch(RecordedRequest request) {
                            try {
                                byte[] reply = tsaResponse(request.getBody().readByteArray());
                                return new MockResponse()
                                        .setHeader("Content-Type", "application/timestamp-reply")
                                        .setBody(new Buffer().write(reply));
                            } catch (Exception e) {
                                return new MockResponse().setResponseCode(500);
                            }
                        }
                    });
            tsa.start();
        }
        String tsaUrl = tsa.url("/tsr").toString();
        ApplicationProperties props = new ApplicationProperties();
        props.getSecurity().getTimestamp().setCustomTsaUrls(new ArrayList<>(List.of(tsaUrl)));
        TimestampController controller = new TimestampController(factory, props, tempFileManager);
        TimestampPdfRequest request = new TimestampPdfRequest();
        request.setFileInput(pdfPart(pdf));
        request.setDocumentPassword(documentPassword);
        request.setTsaUrl(tsaUrl);
        return body(controller.timestampPdf(request));
    }

    /** The earlier revision must survive byte for byte, or its signature cannot verify. */
    private static void assertAppendedOnto(byte[] original, byte[] result) {
        assertThat(result.length).isGreaterThan(original.length);
        assertThat(Arrays.copyOf(result, original.length)).isEqualTo(original);
    }

    private static void assertStillLocked(byte[] pdf, String password) throws IOException {
        assertThatThrownBy(() -> Loader.loadPDF(pdf).close())
                .isInstanceOf(InvalidPasswordException.class);
        try (PDDocument doc = Loader.loadPDF(pdf, password)) {
            assertThat(doc.isEncrypted()).isTrue();
            assertThat(doc.getNumberOfPages()).isEqualTo(PAGE_COUNT);
            assertThat(new PDFTextStripper().getText(doc)).contains(PAGE_TEXT);
            // The increment rewrites the Info dictionary, so reading its strings back proves
            // the new objects were encrypted with the original key.
            assertThat(doc.getDocumentInformation().getProducer()).isEqualTo("Stirling-PDF");
        }
    }

    /** Checks each signature straight from the file bytes, independent of the validator. */
    private static void assertEverySignatureVerifies(byte[] pdf, String password, int expected)
            throws Exception {
        try (PDDocument doc = Loader.loadPDF(pdf, password)) {
            List<PDSignature> signatures = doc.getSignatureDictionaries();
            assertThat(signatures).hasSize(expected);
            for (PDSignature sig : signatures) {
                byte[] signedContent = sig.getSignedContent(pdf);
                byte[] contents = sig.getContents(pdf);
                if ("ETSI.RFC3161".equals(sig.getSubFilter())) {
                    TimeStampToken token =
                            new TimeStampToken(
                                    new CMSSignedData(new ByteArrayInputStream(contents)));
                    byte[] digest = MessageDigest.getInstance("SHA-256").digest(signedContent);
                    assertThat(token.getTimeStampInfo().getMessageImprintDigest())
                            .isEqualTo(digest);
                    token.validate(new JcaSimpleSignerInfoVerifierBuilder().build(tsaCert));
                    continue;
                }
                CMSSignedData cms =
                        new CMSSignedData(
                                new CMSProcessableByteArray(signedContent),
                                new ByteArrayInputStream(contents));
                for (SignerInformation signer : cms.getSignerInfos().getSigners()) {
                    X509CertificateHolder cert =
                            (X509CertificateHolder)
                                    cms.getCertificates()
                                            .getMatches(signer.getSID())
                                            .iterator()
                                            .next();
                    assertThat(signer.verify(new JcaSimpleSignerInfoVerifierBuilder().build(cert)))
                            .as("signature by %s", sig.getName())
                            .isTrue();
                }
            }
            int[] last = signatures.get(signatures.size() - 1).getByteRange();
            assertThat((long) last[2] + last[3]).isEqualTo(pdf.length);
        }
    }

    private void assertValidatorAccepts(byte[] pdf, String password, int expected)
            throws Exception {
        SignatureValidationRequest request = new SignatureValidationRequest();
        request.setFileInput(pdfPart(pdf));
        request.setDocumentPassword(password);
        List<SignatureValidationResult> results = validator.validateSignature(request).getBody();
        assertThat(results).hasSize(expected);
        assertThat(results)
                .allSatisfy(
                        r -> {
                            assertThat(r.getErrorMessage()).isNull();
                            assertThat(r.isValid()).isTrue();
                        });
        assertThat(results).allMatch(SignatureValidationResult::isCoversEntireDocument);
    }

    private static List<String> operatorNames(PDAppearanceStream appearance) throws IOException {
        List<String> names = new ArrayList<>();
        for (Object token : new PDFStreamParser(appearance).parse()) {
            if (token instanceof Operator op) {
                names.add(op.getName());
            }
        }
        return names;
    }

    private static MockMultipartFile pdfPart(byte[] pdf) {
        return new MockMultipartFile("fileInput", "in.pdf", MediaType.APPLICATION_PDF_VALUE, pdf);
    }

    private static byte[] body(ResponseEntity<Resource> response) throws IOException {
        try (InputStream in = response.getBody().getInputStream()) {
            return in.readAllBytes();
        }
    }

    private static X509Certificate tsaCertificate(KeyPair kp) throws Exception {
        X500Principal dn = new X500Principal("CN=Test TSA");
        long now = System.currentTimeMillis();
        JcaX509v3CertificateBuilder builder =
                new JcaX509v3CertificateBuilder(
                        dn,
                        BigInteger.valueOf(now),
                        new Date(now - 60_000L),
                        new Date(now + 365L * 24 * 60 * 60 * 1000),
                        dn,
                        kp.getPublic());
        // RFC 3161 requires the TSA certificate to carry a critical id-kp-timeStamping EKU.
        builder.addExtension(
                Extension.extendedKeyUsage,
                true,
                new ExtendedKeyUsage(KeyPurposeId.id_kp_timeStamping));
        ContentSigner signer = new JcaContentSignerBuilder("SHA256WithRSA").build(kp.getPrivate());
        return new JcaX509CertificateConverter()
                .setProvider("BC")
                .getCertificate(builder.build(signer));
    }

    private static byte[] tsaResponse(byte[] requestBytes) throws Exception {
        TimeStampTokenGenerator tokenGen =
                new TimeStampTokenGenerator(
                        new JcaSignerInfoGeneratorBuilder(
                                        new JcaDigestCalculatorProviderBuilder()
                                                .setProvider("BC")
                                                .build())
                                .build(
                                        new JcaContentSignerBuilder("SHA256WithRSA")
                                                .build(tsaKeyPair.getPrivate()),
                                        tsaCert),
                        new JcaDigestCalculatorProviderBuilder()
                                .setProvider("BC")
                                .build()
                                .get(new AlgorithmIdentifier(OIWObjectIdentifiers.idSHA1)),
                        new ASN1ObjectIdentifier("1.2.3.4.1"));
        tokenGen.addCertificates(new JcaCertStore(List.of(tsaCert)));
        TimeStampResponseGenerator responseGen =
                new TimeStampResponseGenerator(
                        tokenGen, Set.of(NISTObjectIdentifiers.id_sha256.getId()));
        return responseGen
                .generate(new TimeStampRequest(requestBytes), BigInteger.ONE, new Date())
                .getEncoded();
    }
}
