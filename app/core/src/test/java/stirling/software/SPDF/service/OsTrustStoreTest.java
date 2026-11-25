package stirling.software.SPDF.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.Method;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PKCS12Attribute;
import java.security.cert.X509Certificate;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.Set;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.asn1.x509.BasicConstraints;
import org.bouncycastle.asn1.x509.Extension;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.common.model.ApplicationProperties;

class OsTrustStoreTest {

    private static final String TAURI_MODE = "STIRLING_PDF_TAURI_MODE";

    private static KeyPair rootKeys;
    private static X509Certificate root;
    private static X509Certificate leaf;
    private static X509Certificate strayLeaf;

    @BeforeAll
    static void issueChain() throws Exception {
        rootKeys = keys();
        root = issue("CN=Agency Root", rootKeys, "CN=Agency Root", rootKeys, true);
        leaf = issue("CN=Agency Root", rootKeys, "CN=Signer", keys(), false);
        KeyPair otherKeys = keys();
        strayLeaf = issue("CN=Other CA", otherKeys, "CN=Stray", keys(), false);
    }

    @Test
    void readsFirstReadableBundleAndSkipsMissingOnes(@TempDir Path dir) throws Exception {
        Path bundle = dir.resolve("ca-bundle.pem");
        Files.writeString(bundle, pem(root) + pem(leaf));

        List<X509Certificate> certs =
                OsTrustStore.fromFirstBundle(List.of(dir.resolve("missing.pem"), bundle));

        assertThat(certs).containsExactly(root, leaf);
    }

    @Test
    void aPurposeAwareStoreDoesNotFallBackToTheGeneralBundle(@TempDir Path dir) throws Exception {
        Path general = dir.resolve("ca-certificates.crt");
        Files.writeString(general, pem(strayLeaf));
        Path purposeDir = Files.createDirectory(dir.resolve("extracted"));

        assertThat(OsTrustStore.fromLinuxBundles(List.of(purposeDir), List.of(general))).isEmpty();

        Files.writeString(purposeDir.resolve("email-ca-bundle.pem"), pem(root));
        assertThat(OsTrustStore.fromLinuxBundles(List.of(purposeDir), List.of(general)))
                .containsExactly(root);
    }

    @Test
    void noBundleYieldsEmptyList(@TempDir Path dir) {
        assertThat(OsTrustStore.fromFirstBundle(List.of(dir.resolve("missing.pem")))).isEmpty();
    }

    @Test
    void unknownKeyStoreTypeIsSkipped() {
        assertThat(OsTrustStore.fromKeyStores(List.of("NoSuchStore-ROOT"))).isEmpty();
    }

    @Test
    void identitiesInAStoreAreNotTrustAnchors() throws Exception {
        KeyStore store = KeyStore.getInstance("PKCS12");
        store.load(null, null);
        store.setCertificateEntry("agency-root", root);
        KeyPair selfKeys = keys();
        X509Certificate selfSigned =
                issue("CN=My Own Identity", selfKeys, "CN=My Own Identity", selfKeys, false);
        store.setKeyEntry(
                "my-identity",
                selfKeys.getPrivate(),
                "pw".toCharArray(),
                new java.security.cert.Certificate[] {selfSigned});

        assertThat(OsTrustStore.trustedCertificates(store)).containsExactly(root);
    }

    @Test
    void rootsTrustedForOtherPurposesOnlyAreNotAnchors() {
        assertThat(OsTrustStore.trustedForSigning(Set.of(usage("1.2.840.113635.100.1.3"))))
                .as("SSL only")
                .isFalse();
        assertThat(
                        OsTrustStore.trustedForSigning(
                                Set.of(usage("[1.2.840.113635.100.1.3, 1.2.840.113635.100.1.8]"))))
                .as("SSL and S/MIME")
                .isTrue();
        assertThat(OsTrustStore.trustedForSigning(Set.of(usage("2.5.29.37.0"))))
                .as("any purpose")
                .isTrue();
        assertThat(OsTrustStore.trustedForSigning(Set.of())).as("no purpose limit").isTrue();
    }

    private static KeyStore.Entry.Attribute usage(String value) {
        return new PKCS12Attribute(OsTrustStore.TRUSTED_KEY_USAGE, value);
    }

    @Test
    void osAnchorsLetAnOsTrustedChainValidate() throws Exception {
        CertificateValidationService svc = service();

        svc.loadOSTrustAnchors(List.of(root));

        assertThat(svc.buildAndValidatePath(leaf, List.of(), null, new Date()).getTrustAnchor())
                .extracting(a -> a.getTrustedCert())
                .isEqualTo(root);
    }

    @Test
    void chainIsUntrustedWithoutOsAnchors() throws Exception {
        CertificateValidationService svc = service();

        assertThatThrownBy(() -> svc.buildAndValidatePath(leaf, List.of(), null, new Date()))
                .isInstanceOf(GeneralSecurityException.class);
    }

    @Test
    void nonCaEntriesThatAreNotSelfSignedAreNotAnchors() throws Exception {
        CertificateValidationService svc = service();

        svc.loadOSTrustAnchors(List.of(strayLeaf, root));

        assertThat(svc.getSigningTrustStore().size()).isEqualTo(1);
    }

    @Test
    void osTrustIsOnByDefaultOnlyInTheDesktopApp() {
        String previous = System.getProperty(TAURI_MODE);
        var trust = new ApplicationProperties().getSecurity().getValidation().getTrust();
        try {
            System.clearProperty(TAURI_MODE);
            assertThat(trust.trustsOSRoots()).isFalse();
            System.setProperty(TAURI_MODE, "true");
            assertThat(trust.trustsOSRoots()).isTrue();
            trust.setUseOSTrust(false);
            assertThat(trust.trustsOSRoots()).isFalse();
            System.clearProperty(TAURI_MODE);
            trust.setUseOSTrust(true);
            assertThat(trust.trustsOSRoots()).isTrue();
        } finally {
            if (previous == null) {
                System.clearProperty(TAURI_MODE);
            } else {
                System.setProperty(TAURI_MODE, previous);
            }
        }
    }

    private static CertificateValidationService service() throws Exception {
        ApplicationProperties props = new ApplicationProperties();
        var trust = props.getSecurity().getValidation().getTrust();
        trust.setServerAsAnchor(false);
        trust.setUseSystemTrust(false);
        trust.setUseMozillaBundle(false);
        trust.setUseOSTrust(false);
        CertificateValidationService svc = new CertificateValidationService(null, props);
        Method init = CertificateValidationService.class.getDeclaredMethod("initializeTrustStore");
        init.setAccessible(true);
        init.invoke(svc);
        return svc;
    }

    private static KeyPair keys() throws Exception {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
        kpg.initialize(2048);
        return kpg.generateKeyPair();
    }

    private static X509Certificate issue(
            String issuer, KeyPair issuerKeys, String subject, KeyPair subjectKeys, boolean ca)
            throws Exception {
        Date now = new Date();
        JcaX509v3CertificateBuilder builder =
                new JcaX509v3CertificateBuilder(
                        new X500Name(issuer),
                        BigInteger.valueOf(System.nanoTime()),
                        new Date(now.getTime() - 60_000),
                        new Date(now.getTime() + 86_400_000L),
                        new X500Name(subject),
                        subjectKeys.getPublic());
        builder.addExtension(Extension.basicConstraints, true, new BasicConstraints(ca));
        return new JcaX509CertificateConverter()
                .getCertificate(
                        builder.build(
                                new JcaContentSignerBuilder("SHA256withRSA")
                                        .build(issuerKeys.getPrivate())));
    }

    private static String pem(X509Certificate cert) throws Exception {
        return "-----BEGIN CERTIFICATE-----\n"
                + Base64.getMimeEncoder(64, "\n".getBytes()).encodeToString(cert.getEncoded())
                + "\n-----END CERTIFICATE-----\n";
    }
}
