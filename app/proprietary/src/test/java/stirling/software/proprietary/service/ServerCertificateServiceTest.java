package stirling.software.proprietary.service;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.math.BigInteger;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Security;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.util.Date;

import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.cert.X509CertificateHolder;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.service.ServerCertificateServiceInterface.ServerCertificateInfo;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("ServerCertificateService")
class ServerCertificateServiceTest {

    private static final String KEYSTORE_FILENAME = "server-certificate.p12";
    private static final String KEYSTORE_ALIAS = "stirling-pdf-server";
    private static final String DEFAULT_PASSWORD = "stirling-pdf-server-cert";

    // Built once: generating an RSA keypair and self-signed cert is expensive, so reuse across
    // tests.
    private static byte[] validP12WithDefaultPassword;
    private static byte[] validP12WithUploadPassword;
    private static byte[] certOnlyP12; // no private key entry
    private static X509Certificate sampleCert;
    private static final String UPLOAD_PASSWORD = "upload-secret";

    @Mock private LicenseKeyChecker licenseKeyChecker;

    @TempDir Path tempDir;

    private ServerCertificateService service;

    @BeforeAll
    static void buildFixtures() throws Exception {
        if (Security.getProvider("BC") == null) {
            Security.addProvider(new BouncyCastleProvider());
        }

        KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
        kpg.initialize(2048);
        KeyPair keyPair = kpg.generateKeyPair();

        sampleCert = selfSignedCert(keyPair);

        // p12 stored under the service's standard alias + default password
        KeyStore defaultStore = KeyStore.getInstance("PKCS12");
        defaultStore.load(null, null);
        defaultStore.setKeyEntry(
                KEYSTORE_ALIAS,
                keyPair.getPrivate(),
                DEFAULT_PASSWORD.toCharArray(),
                new Certificate[] {sampleCert});
        validP12WithDefaultPassword = serialize(defaultStore, DEFAULT_PASSWORD);

        // p12 with an arbitrary alias + a different password (simulates a user upload)
        KeyStore uploadStore = KeyStore.getInstance("PKCS12");
        uploadStore.load(null, null);
        uploadStore.setKeyEntry(
                "user-alias",
                keyPair.getPrivate(),
                UPLOAD_PASSWORD.toCharArray(),
                new Certificate[] {sampleCert});
        validP12WithUploadPassword = serialize(uploadStore, UPLOAD_PASSWORD);

        // p12 holding only a trusted certificate (no private key entry)
        KeyStore certOnly = KeyStore.getInstance("PKCS12");
        certOnly.load(null, null);
        certOnly.setCertificateEntry("trusted", sampleCert);
        certOnlyP12 = serialize(certOnly, UPLOAD_PASSWORD);
    }

    private static X509Certificate selfSignedCert(KeyPair keyPair) throws Exception {
        X500Name subject = new X500Name("CN=Test, O=Test, C=US");
        Date notBefore = new Date(System.currentTimeMillis() - 1000);
        Date notAfter = new Date(System.currentTimeMillis() + 86_400_000L);
        JcaX509v3CertificateBuilder builder =
                new JcaX509v3CertificateBuilder(
                        subject,
                        BigInteger.valueOf(System.currentTimeMillis()),
                        notBefore,
                        notAfter,
                        subject,
                        keyPair.getPublic());
        ContentSigner signer =
                new JcaContentSignerBuilder("SHA256WithRSA")
                        .setProvider("BC")
                        .build(keyPair.getPrivate());
        X509CertificateHolder holder = builder.build(signer);
        return new JcaX509CertificateConverter().setProvider("BC").getCertificate(holder);
    }

    private static byte[] serialize(KeyStore keyStore, String password) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        keyStore.store(out, password.toCharArray());
        return out.toByteArray();
    }

    @BeforeEach
    void setUp() {
        service = new ServerCertificateService(licenseKeyChecker);
        // Default @Value field state; individual tests override as needed.
        ReflectionTestUtils.setField(service, "enabled", true);
        ReflectionTestUtils.setField(service, "organizationName", "Stirling-PDF");
        ReflectionTestUtils.setField(service, "validityDays", 365);
        ReflectionTestUtils.setField(service, "regenerateOnStartup", false);
    }

    private MockedStatic<InstallationPathConfig> mockConfigPath() {
        MockedStatic<InstallationPathConfig> mocked = mockStatic(InstallationPathConfig.class);
        mocked.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());
        return mocked;
    }

    private Path keystorePath() {
        return Path.of(tempDir.toString(), KEYSTORE_FILENAME);
    }

    private void licenseAs(License license) {
        when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(license);
    }

    @Nested
    @DisplayName("isEnabled")
    class IsEnabled {

        @Test
        @DisplayName("returns true when enabled and license is SERVER")
        void enabledWithServerLicense() {
            ReflectionTestUtils.setField(service, "enabled", true);
            licenseAs(License.SERVER);
            assertTrue(service.isEnabled());
        }

        @Test
        @DisplayName("returns true when enabled and license is ENTERPRISE")
        void enabledWithEnterpriseLicense() {
            ReflectionTestUtils.setField(service, "enabled", true);
            licenseAs(License.ENTERPRISE);
            assertTrue(service.isEnabled());
        }

        @Test
        @DisplayName("returns false when enabled but license is NORMAL")
        void enabledWithoutPremiumLicense() {
            ReflectionTestUtils.setField(service, "enabled", true);
            licenseAs(License.NORMAL);
            assertFalse(service.isEnabled());
        }

        @Test
        @DisplayName("returns false when disabled even with ENTERPRISE license")
        void disabledWithEnterpriseLicense() {
            ReflectionTestUtils.setField(service, "enabled", false);
            licenseAs(License.ENTERPRISE);
            assertFalse(service.isEnabled());
        }
    }

    @Nested
    @DisplayName("hasServerCertificate")
    class HasServerCertificate {

        @Test
        @DisplayName("returns false when keystore file is absent")
        void absent() {
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                assertFalse(service.hasServerCertificate());
            }
        }

        @Test
        @DisplayName("returns true when keystore file exists")
        void present() throws Exception {
            Files.write(keystorePath(), validP12WithDefaultPassword);
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                assertTrue(service.hasServerCertificate());
            }
        }
    }

    @Nested
    @DisplayName("getServerCertificatePassword")
    class GetServerCertificatePassword {

        @Test
        @DisplayName("returns the fixed default password")
        void returnsDefaultPassword() {
            assertEquals(DEFAULT_PASSWORD, service.getServerCertificatePassword());
        }
    }

    @Nested
    @DisplayName("initializeServerCertificate")
    class InitializeServerCertificate {

        @Test
        @DisplayName("does nothing when feature disabled")
        void noOpWhenDisabled() {
            ReflectionTestUtils.setField(service, "enabled", false);
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                service.initializeServerCertificate();
                assertFalse(Files.exists(keystorePath()));
            }
        }

        @Test
        @DisplayName("does nothing when license is NORMAL")
        void noOpWhenNoLicense() {
            ReflectionTestUtils.setField(service, "enabled", true);
            licenseAs(License.NORMAL);
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                service.initializeServerCertificate();
                assertFalse(Files.exists(keystorePath()));
            }
        }

        @Test
        @DisplayName("generates a new keystore when enabled, licensed and none exists")
        void generatesWhenMissing() {
            ReflectionTestUtils.setField(service, "enabled", true);
            licenseAs(License.ENTERPRISE);
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                service.initializeServerCertificate();
                assertTrue(Files.exists(keystorePath()));
            }
        }

        @Test
        @DisplayName("does not regenerate when keystore already exists and regenerate flag is off")
        void keepsExistingWhenNotRegenerating() throws Exception {
            Files.write(keystorePath(), validP12WithDefaultPassword);
            ReflectionTestUtils.setField(service, "enabled", true);
            ReflectionTestUtils.setField(service, "regenerateOnStartup", false);
            licenseAs(License.SERVER);
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                service.initializeServerCertificate();
                // file content untouched (still the fixture bytes we wrote)
                assertArrayEquals(validP12WithDefaultPassword, Files.readAllBytes(keystorePath()));
            }
        }

        @Test
        @DisplayName("regenerates when regenerateOnStartup is true even if keystore exists")
        void regeneratesWhenFlagSet() throws Exception {
            Files.write(keystorePath(), validP12WithDefaultPassword);
            ReflectionTestUtils.setField(service, "enabled", true);
            ReflectionTestUtils.setField(service, "regenerateOnStartup", true);
            licenseAs(License.ENTERPRISE);
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                service.initializeServerCertificate();
                assertTrue(Files.exists(keystorePath()));
                // content replaced with a freshly generated keystore
                byte[] after = Files.readAllBytes(keystorePath());
                assertNotNull(after);
            }
        }

        @Test
        @DisplayName("swallows generation failures instead of propagating them")
        void swallowsGenerationErrors() throws Exception {
            // Point the config path at a regular file so creating the keystore's parent directory
            // fails; the method must catch the exception rather than letting it escape.
            Path asFile = tempDir.resolve("not-a-directory");
            Files.write(asFile, new byte[] {1});
            ReflectionTestUtils.setField(service, "enabled", true);
            licenseAs(License.ENTERPRISE);
            try (MockedStatic<InstallationPathConfig> mocked =
                    mockStatic(InstallationPathConfig.class)) {
                mocked.when(InstallationPathConfig::getConfigPath).thenReturn(asFile.toString());
                // Should not throw even though directory creation under a file fails.
                org.junit.jupiter.api.Assertions.assertDoesNotThrow(
                        () -> service.initializeServerCertificate());
            }
        }
    }

    @Nested
    @DisplayName("getServerKeyStore")
    class GetServerKeyStore {

        @Test
        @DisplayName("throws when license is NORMAL")
        void deniesWithoutLicense() {
            licenseAs(License.NORMAL);
            IllegalStateException ex =
                    assertThrows(IllegalStateException.class, () -> service.getServerKeyStore());
            assertTrue(ex.getMessage().contains("Pro or Enterprise"));
        }

        @Test
        @DisplayName("throws when feature is disabled")
        void deniesWhenDisabled() {
            ReflectionTestUtils.setField(service, "enabled", false);
            licenseAs(License.ENTERPRISE);
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                IllegalStateException ex =
                        assertThrows(
                                IllegalStateException.class, () -> service.getServerKeyStore());
                assertTrue(ex.getMessage().contains("not available"));
            }
        }

        @Test
        @DisplayName("throws when enabled and licensed but no certificate file exists")
        void deniesWhenNoCertificate() {
            ReflectionTestUtils.setField(service, "enabled", true);
            licenseAs(License.ENTERPRISE);
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                IllegalStateException ex =
                        assertThrows(
                                IllegalStateException.class, () -> service.getServerKeyStore());
                assertTrue(ex.getMessage().contains("not available"));
            }
        }

        @Test
        @DisplayName("loads the PKCS12 keystore when present and licensed")
        void loadsKeystore() throws Exception {
            Files.write(keystorePath(), validP12WithDefaultPassword);
            ReflectionTestUtils.setField(service, "enabled", true);
            licenseAs(License.SERVER);
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                KeyStore loaded = service.getServerKeyStore();
                assertNotNull(loaded);
                assertEquals("PKCS12", loaded.getType());
                assertTrue(loaded.containsAlias(KEYSTORE_ALIAS));
            }
        }
    }

    @Nested
    @DisplayName("getServerCertificate / getServerCertificatePublicKey")
    class GetServerCertificate {

        @Test
        @DisplayName("returns the X509 certificate stored under the standard alias")
        void returnsCertificate() throws Exception {
            Files.write(keystorePath(), validP12WithDefaultPassword);
            ReflectionTestUtils.setField(service, "enabled", true);
            licenseAs(License.ENTERPRISE);
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                X509Certificate cert = service.getServerCertificate();
                assertNotNull(cert);
                assertInstanceOf(X509Certificate.class, cert);
            }
        }

        @Test
        @DisplayName("public key bytes equal the certificate's encoded form")
        void returnsEncodedPublicKey() throws Exception {
            Files.write(keystorePath(), validP12WithDefaultPassword);
            ReflectionTestUtils.setField(service, "enabled", true);
            licenseAs(License.ENTERPRISE);
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                X509Certificate cert = service.getServerCertificate();
                byte[] publicKey = service.getServerCertificatePublicKey();
                assertArrayEquals(cert.getEncoded(), publicKey);
            }
        }

        @Test
        @DisplayName("propagates the license check failure from the underlying keystore lookup")
        void deniesWithoutLicense() {
            licenseAs(License.NORMAL);
            assertThrows(IllegalStateException.class, () -> service.getServerCertificate());
        }
    }

    @Nested
    @DisplayName("uploadServerCertificate")
    class UploadServerCertificate {

        @Test
        @DisplayName("throws when license is NORMAL")
        void deniesWithoutLicense() {
            licenseAs(License.NORMAL);
            InputStream in = new ByteArrayInputStream(validP12WithUploadPassword);
            IllegalStateException ex =
                    assertThrows(
                            IllegalStateException.class,
                            () -> service.uploadServerCertificate(in, UPLOAD_PASSWORD));
            assertTrue(ex.getMessage().contains("Pro or Enterprise"));
        }

        @Test
        @DisplayName("rejects an uploaded keystore that has no private key entry")
        void rejectsCertOnlyKeystore() {
            licenseAs(License.ENTERPRISE);
            InputStream in = new ByteArrayInputStream(certOnlyP12);
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                IllegalArgumentException ex =
                        assertThrows(
                                IllegalArgumentException.class,
                                () -> service.uploadServerCertificate(in, UPLOAD_PASSWORD));
                assertTrue(ex.getMessage().contains("No private key"));
            }
        }

        @Test
        @DisplayName("throws when the supplied password is wrong")
        void wrongPasswordFails() {
            licenseAs(License.ENTERPRISE);
            InputStream in = new ByteArrayInputStream(validP12WithUploadPassword);
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                assertThrows(
                        Exception.class,
                        () -> service.uploadServerCertificate(in, "wrong-password"));
            }
        }

        @Test
        @DisplayName("re-stores the uploaded key under the standard alias and default password")
        void storesUnderStandardAlias() throws Exception {
            licenseAs(License.ENTERPRISE);
            InputStream in = new ByteArrayInputStream(validP12WithUploadPassword);
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                service.uploadServerCertificate(in, UPLOAD_PASSWORD);

                assertTrue(Files.exists(keystorePath()));

                // The persisted keystore must be readable with the DEFAULT password and use our
                // standard alias, regardless of what the upload used.
                KeyStore persisted = KeyStore.getInstance("PKCS12");
                try (InputStream fis = Files.newInputStream(keystorePath())) {
                    persisted.load(fis, DEFAULT_PASSWORD.toCharArray());
                }
                assertTrue(persisted.containsAlias(KEYSTORE_ALIAS));
                assertTrue(persisted.isKeyEntry(KEYSTORE_ALIAS));
                PrivateKey key =
                        (PrivateKey)
                                persisted.getKey(KEYSTORE_ALIAS, DEFAULT_PASSWORD.toCharArray());
                assertNotNull(key);
            }
        }
    }

    @Nested
    @DisplayName("deleteServerCertificate")
    class DeleteServerCertificate {

        @Test
        @DisplayName("deletes the keystore file when it exists")
        void deletesExisting() throws Exception {
            Files.write(keystorePath(), validP12WithDefaultPassword);
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                assertTrue(Files.exists(keystorePath()));
                service.deleteServerCertificate();
                assertFalse(Files.exists(keystorePath()));
            }
        }

        @Test
        @DisplayName("is a no-op when the keystore file is absent")
        void noOpWhenAbsent() {
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                assertFalse(Files.exists(keystorePath()));
                // must not throw
                org.junit.jupiter.api.Assertions.assertDoesNotThrow(
                        () -> service.deleteServerCertificate());
            }
        }
    }

    @Nested
    @DisplayName("getServerCertificateInfo")
    class GetServerCertificateInfo {

        @Test
        @DisplayName("reports exists=false and null fields when no certificate present")
        void infoWhenAbsent() throws Exception {
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                ServerCertificateInfo info = service.getServerCertificateInfo();
                assertFalse(info.isExists());
                assertNull(info.getSubject());
                assertNull(info.getIssuer());
                assertNull(info.getValidFrom());
                assertNull(info.getValidTo());
            }
        }

        @Test
        @DisplayName("populates subject/issuer/validity from the stored certificate")
        void infoWhenPresent() throws Exception {
            Files.write(keystorePath(), validP12WithDefaultPassword);
            ReflectionTestUtils.setField(service, "enabled", true);
            licenseAs(License.ENTERPRISE);
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                ServerCertificateInfo info = service.getServerCertificateInfo();
                assertTrue(info.isExists());
                assertNotNull(info.getSubject());
                assertNotNull(info.getIssuer());
                assertEquals(sampleCert.getNotBefore(), info.getValidFrom());
                assertEquals(sampleCert.getNotAfter(), info.getValidTo());
            }
        }

        @Test
        @DisplayName("throws when a certificate exists but the license has been revoked")
        void deniesWhenCertPresentButNoLicense() throws Exception {
            // hasServerCertificate() passes (file present) but getServerCertificate() requires a
            // license, so the underlying lookup must fail.
            Files.write(keystorePath(), validP12WithDefaultPassword);
            licenseAs(License.NORMAL);
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                assertThrows(IllegalStateException.class, () -> service.getServerCertificateInfo());
            }
        }
    }
}
