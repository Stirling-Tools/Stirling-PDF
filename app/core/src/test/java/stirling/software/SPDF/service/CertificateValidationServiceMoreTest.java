package stirling.software.SPDF.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Security;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Base64;
import java.util.Collection;
import java.util.Date;
import java.util.List;
import java.util.Map;

import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cert.jcajce.JcaCertStore;
import org.bouncycastle.cms.CMSProcessableByteArray;
import org.bouncycastle.cms.CMSSignedData;
import org.bouncycastle.cms.CMSSignedDataGenerator;
import org.bouncycastle.cms.SignerInformation;
import org.bouncycastle.cms.jcajce.JcaSignerInfoGeneratorBuilder;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.bouncycastle.operator.jcajce.JcaDigestCalculatorProviderBuilder;
import org.bouncycastle.util.CollectionStore;
import org.bouncycastle.util.Store;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.ServerCertificateServiceInterface;

/**
 * Additional coverage for {@link CertificateValidationService} that drives the real X.509 /
 * KeyStore machinery with the bundled test fixtures, exercises trust-store initialization, and
 * reaches the private trust-list parsers via reflection. Network paths are only hit with file://
 * URLs so no real connection is ever opened.
 */
@DisplayName("CertificateValidationService (more) Tests")
class CertificateValidationServiceMoreTest {

    private static final char[] PASSWORD = "password".toCharArray();

    private X509Certificate realCert;
    private byte[] realCertDer;

    @BeforeAll
    static void registerBc() {
        if (Security.getProvider("BC") == null) {
            Security.addProvider(new BouncyCastleProvider());
        }
    }

    @BeforeEach
    void setUp() throws Exception {
        realCert = loadPemCert();
        realCertDer = realCert.getEncoded();
    }

    // ---------- helpers ----------

    private static byte[] readResource(String path) throws Exception {
        try (InputStream is = new ClassPathResource(path).getInputStream()) {
            return is.readAllBytes();
        }
    }

    private static X509Certificate loadPemCert() throws Exception {
        CertificateFactory cf = CertificateFactory.getInstance("X.509");
        try (InputStream is = new ClassPathResource("certs/test-cert.pem").getInputStream()) {
            return (X509Certificate) cf.generateCertificate(is);
        }
    }

    private static ApplicationProperties defaultProps() {
        // Real POJO defaults: trust all off, revocation "none".
        ApplicationProperties props = new ApplicationProperties();
        props.getSecurity().getValidation().getTrust().setServerAsAnchor(false);
        return props;
    }

    private static CertificateValidationService newService(ApplicationProperties props) {
        return new CertificateValidationService(null, props);
    }

    /**
     * Invoke the private @PostConstruct so signingTrustAnchors is created without a Spring context.
     */
    private static void initTrustStore(CertificateValidationService svc) throws Exception {
        Method m = CertificateValidationService.class.getDeclaredMethod("initializeTrustStore");
        m.setAccessible(true);
        m.invoke(svc);
    }

    @SuppressWarnings("unchecked")
    private static <T> T invokePrivate(
            CertificateValidationService svc, String name, Class<?>[] sig, Object... args)
            throws Exception {
        Method m = CertificateValidationService.class.getDeclaredMethod(name, sig);
        m.setAccessible(true);
        return (T) m.invoke(svc, args);
    }

    private static String certXmlElement(String tagName, byte[] der) {
        return "<" + tagName + ">" + Base64.getEncoder().encodeToString(der) + "</" + tagName + ">";
    }

    // ---------- certificate loading from every fixture format ----------

    @Nested
    @DisplayName("Loading certificates from fixture formats")
    class CertificateLoadingTests {

        @Test
        @DisplayName("PEM, CRT and CER all decode to the same X.509 certificate")
        void loadsTextEncodedFormats() throws Exception {
            CertificateFactory cf = CertificateFactory.getInstance("X.509");
            X509Certificate fromPem =
                    (X509Certificate)
                            cf.generateCertificate(
                                    new ByteArrayInputStream(readResource("certs/test-cert.pem")));
            X509Certificate fromCrt =
                    (X509Certificate)
                            cf.generateCertificate(
                                    new ByteArrayInputStream(readResource("certs/test-cert.crt")));
            X509Certificate fromCer =
                    (X509Certificate)
                            cf.generateCertificate(
                                    new ByteArrayInputStream(readResource("certs/test-cert.cer")));

            assertThat(fromPem).isEqualTo(fromCrt).isEqualTo(fromCer);
            assertThat(fromPem.getSubjectX500Principal().getName()).contains("CN=Test");
        }

        @Test
        @DisplayName("DER binary certificate decodes and matches the PEM form")
        void loadsDerFormat() throws Exception {
            CertificateFactory cf = CertificateFactory.getInstance("X.509");
            X509Certificate fromDer =
                    (X509Certificate)
                            cf.generateCertificate(
                                    new ByteArrayInputStream(readResource("certs/test-cert.der")));
            assertThat(fromDer).isEqualTo(realCert);
        }

        @Test
        @DisplayName("PKCS12 (.p12 and .pfx) keystores expose the certificate and private key")
        void loadsPkcs12Keystores() throws Exception {
            for (String name : new String[] {"certs/test-cert.p12", "certs/test-cert.pfx"}) {
                KeyStore ks = KeyStore.getInstance("PKCS12");
                try (InputStream is = new ClassPathResource(name).getInputStream()) {
                    ks.load(is, PASSWORD);
                }
                String alias = ks.aliases().nextElement();
                assertThat(ks.getCertificate(alias)).isInstanceOf(X509Certificate.class);
                assertThat(ks.getKey(alias, PASSWORD)).isInstanceOf(PrivateKey.class);
            }
        }

        @Test
        @DisplayName("JKS keystore exposes the certificate")
        void loadsJksKeystore() throws Exception {
            KeyStore ks = KeyStore.getInstance("JKS");
            try (InputStream is = new ClassPathResource("certs/test-cert.jks").getInputStream()) {
                ks.load(is, PASSWORD);
            }
            String alias = ks.aliases().nextElement();
            Certificate cert = ks.getCertificate(alias);
            assertThat(cert).isInstanceOf(X509Certificate.class);
        }
    }

    // ---------- public predicate methods with the REAL certificate ----------

    @Nested
    @DisplayName("Predicate methods on the real test certificate")
    class RealCertPredicateTests {

        private final CertificateValidationService svc = newService(defaultProps());

        @Test
        @DisplayName("Test CA certificate reports isCA true")
        void realCertIsCa() {
            assertThat(svc.isCA(realCert)).isTrue();
        }

        @Test
        @DisplayName("Self-signed test certificate reports isSelfSigned true")
        void realCertIsSelfSigned() {
            assertThat(svc.isSelfSigned(realCert)).isTrue();
        }

        @Test
        @DisplayName("Fingerprint of the real certificate is a 64-char uppercase hex string")
        void realCertFingerprint() {
            String fp = svc.sha256Fingerprint(realCert);
            assertThat(fp).hasSize(64).matches("[0-9A-F]+");
        }

        @Test
        @DisplayName("Certificate is inside its validity window mid-2026 and outside it in 1990")
        void realCertValidityWindow() throws Exception {
            Date inWindow = new java.text.SimpleDateFormat("yyyy-MM-dd").parse("2026-01-15");
            Date past = new java.text.SimpleDateFormat("yyyy-MM-dd").parse("1990-01-01");
            assertThat(svc.isOutsideValidityPeriod(realCert, inWindow)).isFalse();
            assertThat(svc.isOutsideValidityPeriod(realCert, past)).isTrue();
        }
    }

    // ---------- extractIntermediateCertificates ----------

    @Nested
    @DisplayName("extractIntermediateCertificates")
    class ExtractIntermediatesTests {

        private final CertificateValidationService svc = newService(defaultProps());

        @Test
        @DisplayName("Excludes the signer certificate, returns the remaining certificates")
        void excludesSignerCert() throws Exception {
            X509CertificateHolder holder = new X509CertificateHolder(realCertDer);
            Store<X509CertificateHolder> store = new CollectionStore<>(List.of(holder));

            // When the only cert is the signer, nothing remains.
            Collection<X509Certificate> none = svc.extractIntermediateCertificates(store, realCert);
            assertThat(none).isEmpty();

            // When the signer is a different cert, the holder cert is returned as an intermediate.
            X509Certificate other = mock(X509Certificate.class);
            Collection<X509Certificate> some = svc.extractIntermediateCertificates(store, other);
            assertThat(some).hasSize(1);
            assertThat(some.iterator().next()).isEqualTo(realCert);
        }
    }

    // ---------- buildAndValidatePath ----------

    @Nested
    @DisplayName("buildAndValidatePath")
    class BuildAndValidatePathTests {

        @Test
        @DisplayName("Self-signed cert validates against itself as a custom trust anchor")
        void validatesAgainstCustomAnchor() throws Exception {
            CertificateValidationService svc = newService(defaultProps());
            var result = svc.buildAndValidatePath(realCert, List.of(), realCert, new Date());
            assertThat(result).isNotNull();
            assertThat(result.getCertPath()).isNotNull();
        }

        @Test
        @DisplayName("Throws when there are no trust anchors at all")
        void throwsWithoutAnchors() throws Exception {
            CertificateValidationService svc = newService(defaultProps());
            initTrustStore(svc); // empty keystore, no anchors
            assertThatThrownBy(
                            () -> svc.buildAndValidatePath(realCert, List.of(), null, new Date()))
                    .isInstanceOf(GeneralSecurityException.class);
        }

        @Test
        @DisplayName("Throws when the custom anchor does not match the signer")
        void throwsWhenAnchorMismatch() throws Exception {
            CertificateValidationService svc = newService(defaultProps());
            // A different self-signed cert as anchor cannot validate the real signer.
            X509Certificate stranger = secondSelfSignedCert();
            assertThatThrownBy(
                            () ->
                                    svc.buildAndValidatePath(
                                            realCert, List.of(), stranger, new Date()))
                    .isInstanceOf(GeneralSecurityException.class);
        }

        @Test
        @DisplayName("Revocation mode 'ocsp' configures the checker without throwing")
        void revocationOcspModeBuildsPath() throws Exception {
            ApplicationProperties props = defaultProps();
            props.getSecurity().getValidation().getRevocation().setMode("ocsp");
            CertificateValidationService svc = newService(props);
            // Self-signed anchor with soft-fail (default) -> path still builds.
            var result = svc.buildAndValidatePath(realCert, List.of(), realCert, new Date());
            assertThat(result).isNotNull();
        }

        @Test
        @DisplayName("Revocation mode 'crl' with hard-fail configures the checker")
        void revocationCrlHardFailBuildsPath() throws Exception {
            ApplicationProperties props = defaultProps();
            props.getSecurity().getValidation().getRevocation().setMode("crl");
            props.getSecurity().getValidation().getRevocation().setHardFail(true);
            CertificateValidationService svc = newService(props);
            // Self-signed cert has no CRLDP, so a self-validating path still succeeds.
            var result = svc.buildAndValidatePath(realCert, List.of(), realCert, new Date());
            assertThat(result).isNotNull();
        }

        @Test
        @DisplayName("Null validation time is accepted (no setDate)")
        void nullValidationTimeAccepted() throws Exception {
            CertificateValidationService svc = newService(defaultProps());
            var result = svc.buildAndValidatePath(realCert, List.of(), realCert, null);
            assertThat(result).isNotNull();
        }

        private X509Certificate secondSelfSignedCert() throws Exception {
            // A genuine, unrelated self-signed certificate that cannot anchor the test signer.
            java.security.KeyPairGenerator kpg = java.security.KeyPairGenerator.getInstance("RSA");
            kpg.initialize(2048);
            java.security.KeyPair kp = kpg.generateKeyPair();
            org.bouncycastle.asn1.x500.X500Name dn =
                    new org.bouncycastle.asn1.x500.X500Name("CN=Stranger");
            Date from = new Date(System.currentTimeMillis() - 86_400_000L);
            Date to = new Date(System.currentTimeMillis() + 86_400_000L * 365);
            org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder builder =
                    new org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder(
                            dn, java.math.BigInteger.valueOf(1), from, to, dn, kp.getPublic());
            org.bouncycastle.operator.ContentSigner signer =
                    new JcaContentSignerBuilder("SHA256WithRSA").build(kp.getPrivate());
            return new org.bouncycastle.cert.jcajce.JcaX509CertificateConverter()
                    .getCertificate(builder.build(signer));
        }
    }

    // ---------- trust store initialization ----------

    @Nested
    @DisplayName("Trust store initialization")
    class TrustStoreInitTests {

        @Test
        @DisplayName("Default initialization creates an empty in-memory trust store")
        void defaultInitCreatesEmptyStore() throws Exception {
            CertificateValidationService svc = newService(defaultProps());
            initTrustStore(svc);
            KeyStore store = svc.getSigningTrustStore();
            assertThat(store).isNotNull();
            assertThat(store.size()).isZero();
        }

        @Test
        @DisplayName("allowAIA sets JDK revocation system properties")
        void allowAiaSetsSystemProperties() throws Exception {
            ApplicationProperties props = defaultProps();
            props.getSecurity().getValidation().setAllowAIA(true);
            CertificateValidationService svc = newService(props);
            initTrustStore(svc);
            assertThat(Security.getProperty("ocsp.enable")).isEqualTo("true");
            assertThat(System.getProperty("com.sun.security.enableCRLDP")).isEqualTo("true");
        }

        @Test
        @DisplayName("Java system trust store loading populates trust anchors")
        void loadsJavaSystemTrustStore() throws Exception {
            ApplicationProperties props = defaultProps();
            props.getSecurity().getValidation().getTrust().setUseSystemTrust(true);
            CertificateValidationService svc = newService(props);
            initTrustStore(svc);
            // The JVM cacerts bundle has many CA certificates.
            assertThat(svc.getSigningTrustStore().size()).isGreaterThan(0);
        }

        @Test
        @DisplayName("Mozilla bundle path is a no-op when the bundle is absent")
        void mozillaBundleAbsentIsNoOp() throws Exception {
            ApplicationProperties props = defaultProps();
            props.getSecurity().getValidation().getTrust().setUseMozillaBundle(true);
            CertificateValidationService svc = newService(props);
            initTrustStore(svc);
            // No certs/cacert.pem resource exists, so nothing is loaded but init succeeds.
            assertThat(svc.getSigningTrustStore()).isNotNull();
        }

        @Test
        @DisplayName("Server certificate is added as an anchor when self-signed")
        void serverCertAddedAsAnchor() throws Exception {
            ServerCertificateServiceInterface serverSvc =
                    mock(ServerCertificateServiceInterface.class);
            when(serverSvc.isEnabled()).thenReturn(true);
            when(serverSvc.hasServerCertificate()).thenReturn(true);
            when(serverSvc.getServerCertificate()).thenReturn(realCert);

            ApplicationProperties props = defaultProps();
            props.getSecurity().getValidation().getTrust().setServerAsAnchor(true);
            CertificateValidationService svc = new CertificateValidationService(serverSvc, props);
            initTrustStore(svc);

            assertThat(svc.getSigningTrustStore().size()).isEqualTo(1);
            assertThat(svc.getSigningTrustStore().getCertificate("server-anchor"))
                    .isEqualTo(realCert);
        }

        @Test
        @DisplayName("Disabled server certificate service contributes no anchor")
        void disabledServerCertNotAdded() throws Exception {
            ServerCertificateServiceInterface serverSvc =
                    mock(ServerCertificateServiceInterface.class);
            when(serverSvc.isEnabled()).thenReturn(false);

            ApplicationProperties props = defaultProps();
            props.getSecurity().getValidation().getTrust().setServerAsAnchor(true);
            CertificateValidationService svc = new CertificateValidationService(serverSvc, props);
            initTrustStore(svc);

            assertThat(svc.getSigningTrustStore().size()).isZero();
        }

        @Test
        @DisplayName("AATL/EUTL enabled with file:// URLs perform no network call and add nothing")
        void aatlEutlWithFileUrlsNoNetwork() throws Exception {
            ApplicationProperties props = defaultProps();
            props.getSecurity().getValidation().getTrust().setUseAATL(true);
            props.getSecurity().getValidation().getTrust().setUseEUTL(true);
            // file:// is not an HttpURLConnection, so the download helpers return null safely.
            props.getSecurity().getValidation().getAatl().setUrl("file:///does-not-exist.pdf");
            props.getSecurity().getValidation().getEutl().setLotlUrl("file:///does-not-exist.xml");
            CertificateValidationService svc = newService(props);
            initTrustStore(svc);
            assertThat(svc.getSigningTrustStore().size()).isZero();
        }
    }

    // ---------- private trust-list parsers via reflection ----------

    @Nested
    @DisplayName("Trust-list parsers (reflection)")
    class TrustListParserTests {

        private CertificateValidationService svc;

        @BeforeEach
        void initService() throws Exception {
            svc = newService(defaultProps());
            initTrustStore(svc); // parsers add to signingTrustAnchors
        }

        @Test
        @DisplayName("parseSecuritySettingsXML imports CA certificate nodes and skips empties")
        void parseSecuritySettingsXmlImportsCa() throws Exception {
            String xml =
                    "<Settings>"
                            + certXmlElement("Certificate", realCertDer)
                            + "<Certificate></Certificate>"
                            + "</Settings>";
            int added =
                    invokePrivate(
                            svc,
                            "parseSecuritySettingsXML",
                            new Class<?>[] {InputStream.class},
                            new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
            assertThat(added).isEqualTo(1);
            assertThat(svc.getSigningTrustStore().size()).isEqualTo(1);
        }

        @Test
        @DisplayName("parseSecuritySettingsXML returns zero when no Certificate nodes present")
        void parseSecuritySettingsXmlNoCerts() throws Exception {
            String xml = "<Settings><Other>x</Other></Settings>";
            int added =
                    invokePrivate(
                            svc,
                            "parseSecuritySettingsXML",
                            new Class<?>[] {InputStream.class},
                            new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
            assertThat(added).isZero();
        }

        @Test
        @DisplayName("tryParseSecuritySettingsXML returns null when the file spec is missing")
        void tryParseReturnsNullWithoutSpec() throws Exception {
            Map<String, ?> empty = Map.of();
            Object result =
                    invokePrivate(
                            svc, "tryParseSecuritySettingsXML", new Class<?>[] {Map.class}, empty);
            assertThat(result).isNull();
        }

        @Test
        @DisplayName("parseLotlForTslLocations extracts every TSLLocation URL")
        void parseLotlExtractsLocations() throws Exception {
            String ns = "http://uri.etsi.org/02231/v2#";
            String lotl =
                    "<TrustServiceStatusList xmlns=\""
                            + ns
                            + "\"><SchemeInformation><PointersToOtherTSL>"
                            + "<OtherTSLPointer><TSLLocation>https://a.test/tsl1.xml</TSLLocation></OtherTSLPointer>"
                            + "<OtherTSLPointer><TSLLocation>https://b.test/tsl2.xml</TSLLocation></OtherTSLPointer>"
                            + "</PointersToOtherTSL></SchemeInformation></TrustServiceStatusList>";
            List<String> urls =
                    invokePrivate(
                            svc,
                            "parseLotlForTslLocations",
                            new Class<?>[] {byte[].class},
                            (Object) lotl.getBytes(StandardCharsets.UTF_8));
            assertThat(urls).containsExactly("https://a.test/tsl1.xml", "https://b.test/tsl2.xml");
        }

        @Test
        @DisplayName("parseLotlForTslLocations returns empty list when no pointers exist")
        void parseLotlNoPointers() throws Exception {
            String ns = "http://uri.etsi.org/02231/v2#";
            String lotl =
                    "<TrustServiceStatusList xmlns=\""
                            + ns
                            + "\"><SchemeInformation/></TrustServiceStatusList>";
            List<String> urls =
                    invokePrivate(
                            svc,
                            "parseLotlForTslLocations",
                            new Class<?>[] {byte[].class},
                            (Object) lotl.getBytes(StandardCharsets.UTF_8));
            assertThat(urls).isEmpty();
        }

        @Test
        @DisplayName("parseTslAndAddCas imports a qualified, active CA certificate")
        void parseTslImportsQualifiedActiveCa() throws Exception {
            String ns = "http://uri.etsi.org/02231/v2#";
            String tsl =
                    "<TrustServiceStatusList xmlns=\""
                            + ns
                            + "\"><TSPService><ServiceInformation>"
                            + "<ServiceTypeIdentifier>http://uri.etsi.org/TrstSvc/Svctype/CA/QC</ServiceTypeIdentifier>"
                            + "<ServiceStatus>http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/undersupervision</ServiceStatus>"
                            + "<ServiceDigitalIdentity><DigitalId>"
                            + certXmlElement("X509Certificate", realCertDer)
                            + "</DigitalId></ServiceDigitalIdentity>"
                            + "</ServiceInformation></TSPService></TrustServiceStatusList>";
            int added =
                    invokePrivate(
                            svc,
                            "parseTslAndAddCas",
                            new Class<?>[] {byte[].class, String.class},
                            tsl.getBytes(StandardCharsets.UTF_8),
                            "https://source.test/tsl.xml");
            assertThat(added).isEqualTo(1);
            assertThat(svc.getSigningTrustStore().size()).isEqualTo(1);
        }

        @Test
        @DisplayName("parseTslAndAddCas skips services whose type is not qualified")
        void parseTslSkipsNonQualified() throws Exception {
            String ns = "http://uri.etsi.org/02231/v2#";
            String tsl =
                    "<TrustServiceStatusList xmlns=\""
                            + ns
                            + "\"><TSPService><ServiceInformation>"
                            + "<ServiceTypeIdentifier>http://uri.etsi.org/TrstSvc/Svctype/unspecified</ServiceTypeIdentifier>"
                            + "<ServiceStatus>http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/undersupervision</ServiceStatus>"
                            + "<ServiceDigitalIdentity><DigitalId>"
                            + certXmlElement("X509Certificate", realCertDer)
                            + "</DigitalId></ServiceDigitalIdentity>"
                            + "</ServiceInformation></TSPService></TrustServiceStatusList>";
            int added =
                    invokePrivate(
                            svc,
                            "parseTslAndAddCas",
                            new Class<?>[] {byte[].class, String.class},
                            tsl.getBytes(StandardCharsets.UTF_8),
                            "https://source.test/tsl.xml");
            assertThat(added).isZero();
        }

        @Test
        @DisplayName("parseTslAndAddCas skips qualified services in an inactive status")
        void parseTslSkipsInactiveStatus() throws Exception {
            String ns = "http://uri.etsi.org/02231/v2#";
            String tsl =
                    "<TrustServiceStatusList xmlns=\""
                            + ns
                            + "\"><TSPService><ServiceInformation>"
                            + "<ServiceTypeIdentifier>http://uri.etsi.org/TrstSvc/Svctype/CA/QC</ServiceTypeIdentifier>"
                            + "<ServiceStatus>http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/withdrawn</ServiceStatus>"
                            + "<ServiceDigitalIdentity><DigitalId>"
                            + certXmlElement("X509Certificate", realCertDer)
                            + "</DigitalId></ServiceDigitalIdentity>"
                            + "</ServiceInformation></TSPService></TrustServiceStatusList>";
            int added =
                    invokePrivate(
                            svc,
                            "parseTslAndAddCas",
                            new Class<?>[] {byte[].class, String.class},
                            tsl.getBytes(StandardCharsets.UTF_8),
                            "https://source.test/tsl.xml");
            assertThat(added).isZero();
        }

        @Test
        @DisplayName("isActiveStatus accepts supervised/accredited and rejects withdrawn")
        void isActiveStatusBranches() throws Exception {
            boolean supervised =
                    invokePrivate(
                            svc,
                            "isActiveStatus",
                            new Class<?>[] {String.class},
                            "http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/undersupervision");
            boolean accredited =
                    invokePrivate(
                            svc,
                            "isActiveStatus",
                            new Class<?>[] {String.class},
                            "http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/accredited");
            boolean withdrawn =
                    invokePrivate(
                            svc,
                            "isActiveStatus",
                            new Class<?>[] {String.class},
                            "http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/withdrawn");
            assertThat(supervised).isTrue();
            assertThat(accredited).isTrue();
            assertThat(withdrawn).isFalse();
        }

        @Test
        @DisplayName("isActiveStatus honours acceptTransitional for supervision-in-cessation")
        void isActiveStatusTransitional() throws Exception {
            ApplicationProperties props = defaultProps();
            props.getSecurity().getValidation().getEutl().setAcceptTransitional(true);
            CertificateValidationService transitional = newService(props);
            initTrustStore(transitional);
            boolean cessation =
                    invokePrivate(
                            transitional,
                            "isActiveStatus",
                            new Class<?>[] {String.class},
                            "http://uri.etsi.org/TrstSvc/TrustedList/Svcstatus/supervisionincessation");
            assertThat(cessation).isTrue();
        }

        @Test
        @DisplayName("parseAATLPdf returns zero for a PDF without embedded files")
        void parseAatlPdfNoEmbeddedFiles() throws Exception {
            byte[] plainPdf;
            try (org.apache.pdfbox.pdmodel.PDDocument doc =
                    new org.apache.pdfbox.pdmodel.PDDocument()) {
                doc.addPage(new org.apache.pdfbox.pdmodel.PDPage());
                java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
                doc.save(baos);
                plainPdf = baos.toByteArray();
            }
            int added =
                    invokePrivate(
                            svc, "parseAATLPdf", new Class<?>[] {byte[].class}, (Object) plainPdf);
            assertThat(added).isZero();
        }
    }

    // ---------- extractValidationTime with real CMS ----------

    @Nested
    @DisplayName("extractValidationTime")
    class ExtractValidationTimeTests {

        private final CertificateValidationService svc = newService(defaultProps());

        @Test
        @DisplayName("Returns signing-time source when the CMS carries a signingTime attribute")
        void returnsSigningTime() throws Exception {
            SignerInformation signerInfo = buildSignerWithSignedAttrs();
            CertificateValidationService.ValidationTime vt = svc.extractValidationTime(signerInfo);
            assertThat(vt).isNotNull();
            assertThat(vt.source).isEqualTo("signing-time");
            assertThat(vt.date).isNotNull();
        }

        @Test
        @DisplayName("Returns null when neither timestamp nor signingTime are present")
        void returnsNullWhenNoAttributes() throws Exception {
            SignerInformation signerInfo = buildSignerWithoutSignedAttrs();
            assertThat(svc.extractValidationTime(signerInfo)).isNull();
        }

        private SignerInformation buildSignerWithSignedAttrs() throws Exception {
            KeyStore ks = KeyStore.getInstance("PKCS12");
            try (InputStream is = new ClassPathResource("certs/test-cert.p12").getInputStream()) {
                ks.load(is, PASSWORD);
            }
            String alias = ks.aliases().nextElement();
            PrivateKey pk = (PrivateKey) ks.getKey(alias, PASSWORD);
            X509Certificate cert = (X509Certificate) ks.getCertificate(alias);

            CMSSignedDataGenerator gen = new CMSSignedDataGenerator();
            gen.addSignerInfoGenerator(
                    new JcaSignerInfoGeneratorBuilder(
                                    new JcaDigestCalculatorProviderBuilder().build())
                            .build(new JcaContentSignerBuilder("SHA256WithRSA").build(pk), cert));
            gen.addCertificates(
                    new JcaCertStore(new ArrayList<>(Arrays.asList(new Certificate[] {cert}))));
            // encapsulate=true so signed attributes (incl. signingTime) are generated.
            CMSSignedData sd = gen.generate(new CMSProcessableByteArray("data".getBytes()), true);
            // Re-parse from DER so the signingTime value deserializes as ASN1UTCTime.
            CMSSignedData reparsed = new CMSSignedData(sd.getEncoded());
            return reparsed.getSignerInfos().getSigners().iterator().next();
        }

        private SignerInformation buildSignerWithoutSignedAttrs() throws Exception {
            KeyStore ks = KeyStore.getInstance("PKCS12");
            try (InputStream is = new ClassPathResource("certs/test-cert.p12").getInputStream()) {
                ks.load(is, PASSWORD);
            }
            String alias = ks.aliases().nextElement();
            PrivateKey pk = (PrivateKey) ks.getKey(alias, PASSWORD);
            X509Certificate cert = (X509Certificate) ks.getCertificate(alias);

            CMSSignedDataGenerator gen = new CMSSignedDataGenerator();
            // No signed-attribute table -> no signingTime, no timestamp.
            gen.addSignerInfoGenerator(
                    new JcaSignerInfoGeneratorBuilder(
                                    new JcaDigestCalculatorProviderBuilder().build())
                            .setDirectSignature(true)
                            .build(new JcaContentSignerBuilder("SHA256WithRSA").build(pk), cert));
            gen.addCertificates(
                    new JcaCertStore(new ArrayList<>(Arrays.asList(new Certificate[] {cert}))));
            CMSSignedData sd = gen.generate(new CMSProcessableByteArray("data".getBytes()), false);
            CMSSignedData reparsed =
                    new CMSSignedData(
                            new CMSProcessableByteArray("data".getBytes()), sd.getEncoded());
            return reparsed.getSignerInfos().getSigners().iterator().next();
        }
    }

    // ---------- small private helpers ----------

    @Nested
    @DisplayName("Private utility helpers (reflection)")
    class PrivateHelperTests {

        private final CertificateValidationService svc = newService(defaultProps());

        @Test
        @DisplayName("bytesToHex renders bytes as upper-case two-digit hex")
        void bytesToHexFormatsBytes() throws Exception {
            String hex =
                    invokePrivate(
                            svc,
                            "bytesToHex",
                            new Class<?>[] {byte[].class},
                            (Object) new byte[] {0x00, 0x0f, (byte) 0xff, 0x10});
            assertThat(hex).isEqualTo("000FFF10");
        }

        @Test
        @DisplayName("secureDbfWithNamespaces returns a namespace-aware factory")
        void secureDbfIsNamespaceAware() throws Exception {
            javax.xml.parsers.DocumentBuilderFactory factory =
                    invokePrivate(svc, "secureDbfWithNamespaces", new Class<?>[] {});
            assertThat(factory.isNamespaceAware()).isTrue();
        }
    }
}
