package stirling.software.SPDF.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.Provider;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.Calendar;
import java.util.Collection;
import java.util.Date;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.interactive.digitalsignature.PDSignature;
import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.cms.CMSProcessableByteArray;
import org.bouncycastle.cms.CMSSignedData;
import org.bouncycastle.cms.SignerInformation;
import org.bouncycastle.cms.jcajce.JcaSimpleSignerInfoVerifierBuilder;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.bouncycastle.util.Selector;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import stirling.software.SPDF.controller.api.security.CertSignController;
import stirling.software.SPDF.model.api.security.HardwareCertificateInfo;
import stirling.software.SPDF.service.HardwareKeyStoreService.Pkcs11Session;

/**
 * End-to-end signing against real hardware-style key stores. Both tests self-skip unless their
 * environment is present, so the suite stays green on machines without a token:
 *
 * <ul>
 *   <li><b>PKCS#11</b> - point {@code -Dstirling.test.pkcs11.library=...} at a SoftHSM2 / OpenSC /
 *       YubiKey driver (plus {@code .pin} and optional {@code .slot}). The token must already be
 *       initialised; {@code scripts/test/setup-softhsm2.sh} does that for SoftHSM2.
 *   <li><b>Windows store</b> - opt in with {@code -Dstirling.test.windowsStore=true} on Windows.
 *       The test imports a throwaway self-signed certificate into the current user's store, signs,
 *       then removes it.
 * </ul>
 */
class HardwareSigningIntegrationTest {

    private static final String PKCS11_LIBS_PROP = "stirling.pkcs11.libraries";

    @BeforeAll
    static void registerBouncyCastle() {
        if (java.security.Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
            java.security.Security.addProvider(new BouncyCastleProvider());
        }
    }

    // ------------------------------------------------------------------
    // PKCS#11 (SoftHSM2 / OpenSC / YubiKey)
    // ------------------------------------------------------------------

    @Test
    void signsPdfWithPkcs11Token() throws Exception {
        String library = System.getProperty("stirling.test.pkcs11.library");
        String pin = System.getProperty("stirling.test.pkcs11.pin", "1234");
        String slotProp = System.getProperty("stirling.test.pkcs11.slot");
        assumeTrue(
                library != null && !library.isBlank(),
                "Set -Dstirling.test.pkcs11.library to run the PKCS#11 signing test");

        Integer slot = slotProp != null && !slotProp.isBlank() ? Integer.valueOf(slotProp) : null;
        String previousLibs = System.getProperty(PKCS11_LIBS_PROP);
        System.setProperty(PKCS11_LIBS_PROP, library);

        HardwareKeyStoreService service = new HardwareKeyStoreService("Client-test");
        String alias = "stirling-pkcs11-test";
        Pkcs11Session session = null;
        try {
            session = service.openPkcs11(library, slot, pin.toCharArray());
            KeyStore ks = session.keyStore();
            Provider provider = session.provider();

            // Generate the key pair ON the token, then store a self-signed cert for it.
            KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA", provider);
            kpg.initialize(2048);
            KeyPair keyPair = kpg.generateKeyPair();
            X509Certificate cert = selfSign(keyPair, "CN=Stirling PKCS11 Test", provider);
            ks.setKeyEntry(
                    alias, keyPair.getPrivate(), pin.toCharArray(), new Certificate[] {cert});

            // Enumeration should now surface the certificate.
            List<HardwareCertificateInfo> certs =
                    service.listPkcs11Certificates(library, slot, pin.toCharArray());
            assertTrue(
                    certs.stream().anyMatch(c -> alias.equals(c.alias())),
                    "token certificate should be enumerated");

            byte[] signed = signSamplePdf(ks, pin.toCharArray(), alias, provider);
            assertSignatureValid(signed);
        } finally {
            if (session != null) {
                try {
                    session.keyStore().deleteEntry(alias);
                } catch (Exception ignored) {
                    // best-effort cleanup
                }
            }
            restoreProperty(PKCS11_LIBS_PROP, previousLibs);
        }
    }

    // ------------------------------------------------------------------
    // Windows certificate store (SunMSCAPI)
    // ------------------------------------------------------------------

    @Test
    void signsPdfWithWindowsStore() throws Exception {
        boolean optIn = Boolean.getBoolean("stirling.test.windowsStore");
        boolean windows =
                System.getProperty("os.name", "")
                        .toLowerCase(java.util.Locale.ROOT)
                        .contains("win");
        assumeTrue(
                windows && optIn,
                "Run on Windows with -Dstirling.test.windowsStore=true to exercise the Windows store");

        String cn = "Stirling Windows Store Test " + System.currentTimeMillis();
        String pfxPin = "stirlingtest";
        java.nio.file.Path pfx = java.nio.file.Files.createTempFile("stirling-test", ".pfx");
        String thumbprint = null;
        try {
            // Build a throwaway PFX and import it into the current user's store.
            createPfx(pfx, cn, pfxPin);
            thumbprint = importPfxToWindowsStore(pfx, pfxPin);
            assertNotNull(thumbprint, "import should yield a thumbprint");

            HardwareKeyStoreService service = new HardwareKeyStoreService("Client-windows");
            KeyStore ks = service.loadWindowsKeyStore();
            Provider provider = service.windowsProvider();

            String alias =
                    service.listWindowsCertificates().stream()
                            .filter(c -> cn.equals(c.subjectCommonName()))
                            .map(HardwareCertificateInfo::alias)
                            .findFirst()
                            .orElseThrow(
                                    () ->
                                            new AssertionError(
                                                    "imported certificate not found in store"));

            byte[] signed = signSamplePdf(ks, null, alias, provider);
            assertSignatureValid(signed);
        } finally {
            java.nio.file.Files.deleteIfExists(pfx);
            if (thumbprint != null) {
                removeFromWindowsStore(thumbprint);
            }
        }
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    private static X509Certificate selfSign(KeyPair keyPair, String dn, Provider signProvider)
            throws Exception {
        X500Name name = new X500Name(dn);
        Date notBefore = new Date(System.currentTimeMillis() - 86_400_000L);
        Date notAfter = new Date(System.currentTimeMillis() + 365L * 86_400_000L);
        JcaX509v3CertificateBuilder builder =
                new JcaX509v3CertificateBuilder(
                        name,
                        BigInteger.valueOf(System.currentTimeMillis()),
                        notBefore,
                        notAfter,
                        name,
                        keyPair.getPublic());
        JcaContentSignerBuilder csb = new JcaContentSignerBuilder("SHA256withRSA");
        if (signProvider != null) {
            csb.setProvider(signProvider);
        }
        ContentSigner signer = csb.build(keyPair.getPrivate());
        X509CertificateHolder holder = builder.build(signer);
        return new JcaX509CertificateConverter()
                .setProvider(BouncyCastleProvider.PROVIDER_NAME)
                .getCertificate(holder);
    }

    private static byte[] samplePdf() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            doc.addPage(new PDPage());
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return out.toByteArray();
        }
    }

    private static byte[] signSamplePdf(KeyStore ks, char[] pin, String alias, Provider provider)
            throws Exception {
        byte[] pdf = samplePdf();
        try (PDDocument doc = Loader.loadPDF(pdf)) {
            PDSignature signature = new PDSignature();
            signature.setFilter(PDSignature.FILTER_ADOBE_PPKLITE);
            signature.setSubFilter(PDSignature.SUBFILTER_ADBE_PKCS7_DETACHED);
            signature.setName("Stirling Hardware Test");
            signature.setSignDate(Calendar.getInstance());

            CertSignController.CreateSignature createSignature =
                    new CertSignController.CreateSignature(ks, pin, alias, provider);
            doc.addSignature(signature, createSignature);

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.saveIncremental(out);
            return out.toByteArray();
        }
    }

    /** Parse the signed PDF and cryptographically verify the embedded CMS signature. */
    private static void assertSignatureValid(byte[] signedPdf) throws Exception {
        try (PDDocument doc = Loader.loadPDF(signedPdf)) {
            List<PDSignature> signatures = doc.getSignatureDictionaries();
            assertFalse(signatures.isEmpty(), "a signature dictionary should be present");
            PDSignature signature = signatures.get(0);
            byte[] cmsBytes = signature.getContents(signedPdf);
            byte[] signedContent = signature.getSignedContent(signedPdf);
            assertNotNull(cmsBytes);
            assertNotNull(signedContent);

            CMSSignedData cms =
                    new CMSSignedData(new CMSProcessableByteArray(signedContent), cmsBytes);
            boolean verified = false;
            for (SignerInformation signer : cms.getSignerInfos().getSigners()) {
                @SuppressWarnings("unchecked")
                Collection<X509CertificateHolder> matches =
                        cms.getCertificates()
                                .getMatches((Selector<X509CertificateHolder>) signer.getSID());
                X509CertificateHolder certHolder = matches.iterator().next();
                verified =
                        signer.verify(
                                new JcaSimpleSignerInfoVerifierBuilder()
                                        .setProvider(BouncyCastleProvider.PROVIDER_NAME)
                                        .build(certHolder));
                if (verified) {
                    break;
                }
            }
            assertTrue(verified, "the token's CMS signature should verify against its certificate");
        }
    }

    private static void createPfx(java.nio.file.Path pfx, String cn, String pin) throws Exception {
        KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
        kpg.initialize(2048);
        KeyPair keyPair = kpg.generateKeyPair();
        X509Certificate cert = selfSign(keyPair, "CN=" + cn, null);
        KeyStore p12 = KeyStore.getInstance("PKCS12");
        p12.load(null, null);
        p12.setKeyEntry("alias", keyPair.getPrivate(), pin.toCharArray(), new Certificate[] {cert});
        try (java.io.OutputStream os = java.nio.file.Files.newOutputStream(pfx)) {
            p12.store(os, pin.toCharArray());
        }
    }

    private static String importPfxToWindowsStore(java.nio.file.Path pfx, String pin)
            throws Exception {
        String script =
                "$p = ConvertTo-SecureString -String '"
                        + pin
                        + "' -Force -AsPlainText; "
                        + "$c = Import-PfxCertificate -FilePath '"
                        + pfx.toAbsolutePath()
                        + "' -CertStoreLocation Cert:\\CurrentUser\\My -Password $p; "
                        + "Write-Output $c.Thumbprint";
        String out = runPowerShell(script).trim();
        return out.isBlank() ? null : out.lines().reduce((a, b) -> b).orElse(null);
    }

    private static void removeFromWindowsStore(String thumbprint) throws Exception {
        runPowerShell(
                "Remove-Item -Path 'Cert:\\CurrentUser\\My\\" + thumbprint + "' -DeleteKey -Force");
    }

    private static String runPowerShell(String script) throws Exception {
        Process process =
                new ProcessBuilder(
                                "powershell", "-NoProfile", "-NonInteractive", "-Command", script)
                        .redirectErrorStream(true)
                        .start();
        String output = new String(process.getInputStream().readAllBytes());
        process.waitFor();
        return output;
    }

    private static void restoreProperty(String key, String previous) {
        if (previous == null) {
            System.clearProperty(key);
        } else {
            System.setProperty(key, previous);
        }
    }
}
