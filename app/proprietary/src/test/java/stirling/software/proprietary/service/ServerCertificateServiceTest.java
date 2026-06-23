package stirling.software.proprietary.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.cert.X509Certificate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;

/**
 * Tests for {@link ServerCertificateService}. Uses a {@link TempDir} for the keystore location
 * (mocked via {@link InstallationPathConfig}) and a mocked {@link LicenseKeyChecker} to drive the
 * Pro/Enterprise license gating.
 */
@ExtendWith(MockitoExtension.class)
class ServerCertificateServiceTest {

    @Mock private LicenseKeyChecker licenseKeyChecker;

    @TempDir Path tempDir;

    private ServerCertificateService service;

    private static final String KEYSTORE_FILE = "server-certificate.p12";
    private static final String KEYSTORE_ALIAS = "stirling-pdf-server";
    private static final String DEFAULT_PASSWORD = "stirling-pdf-server-cert";

    @BeforeEach
    void setUp() {
        service = new ServerCertificateService(licenseKeyChecker);
        // default: feature enabled, validity 365, org Stirling-PDF, no regenerate
        ReflectionTestUtils.setField(service, "enabled", true);
        ReflectionTestUtils.setField(service, "organizationName", "Stirling-PDF");
        ReflectionTestUtils.setField(service, "validityDays", 365);
        ReflectionTestUtils.setField(service, "regenerateOnStartup", false);
    }

    /** Opens a static mock of InstallationPathConfig returning the temp dir as config path. */
    private MockedStatic<InstallationPathConfig> mockConfigPath() {
        MockedStatic<InstallationPathConfig> mocked = mockStatic(InstallationPathConfig.class);
        mocked.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString() + "/");
        return mocked;
    }

    private void grantProLicense() {
        lenient()
                .when(licenseKeyChecker.getPremiumLicenseEnabledResult())
                .thenReturn(License.SERVER);
    }

    private void denyLicense() {
        lenient()
                .when(licenseKeyChecker.getPremiumLicenseEnabledResult())
                .thenReturn(License.NORMAL);
    }

    // -------------------------------------------------------------------------
    @Nested
    @DisplayName("isEnabled")
    class IsEnabled {

        @Test
        @DisplayName("true when feature flag on and license is SERVER")
        void enabledWithServerLicense() {
            grantProLicense();
            assertThat(service.isEnabled()).isTrue();
        }

        @Test
        @DisplayName("true when feature flag on and license is ENTERPRISE")
        void enabledWithEnterpriseLicense() {
            when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);
            assertThat(service.isEnabled()).isTrue();
        }

        @Test
        @DisplayName("false when license is NORMAL")
        void disabledWithNormalLicense() {
            denyLicense();
            assertThat(service.isEnabled()).isFalse();
        }

        @Test
        @DisplayName("false when feature flag off even with a valid license")
        void disabledWhenFlagOff() {
            ReflectionTestUtils.setField(service, "enabled", false);
            assertThat(service.isEnabled()).isFalse();
        }
    }

    // -------------------------------------------------------------------------
    @Nested
    @DisplayName("getServerCertificatePassword")
    class Password {

        @Test
        @DisplayName("returns the fixed default password")
        void returnsDefault() {
            assertThat(service.getServerCertificatePassword()).isEqualTo(DEFAULT_PASSWORD);
        }
    }

    // -------------------------------------------------------------------------
    @Nested
    @DisplayName("hasServerCertificate")
    class HasCertificate {

        @Test
        @DisplayName("false when no keystore file exists")
        void falseWhenMissing() {
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                assertThat(service.hasServerCertificate()).isFalse();
            }
        }

        @Test
        @DisplayName("true once a keystore file is present")
        void trueWhenPresent() throws Exception {
            Files.createFile(tempDir.resolve(KEYSTORE_FILE));
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                assertThat(service.hasServerCertificate()).isTrue();
            }
        }
    }

    // -------------------------------------------------------------------------
    @Nested
    @DisplayName("initializeServerCertificate")
    class Initialize {

        @Test
        @DisplayName("generates a keystore when none exists and license granted")
        void generatesWhenMissing() {
            grantProLicense();
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                service.initializeServerCertificate();
                assertThat(Files.exists(tempDir.resolve(KEYSTORE_FILE))).isTrue();
            }
        }

        @Test
        @DisplayName("does nothing when the feature flag is off")
        void noopWhenDisabled() {
            ReflectionTestUtils.setField(service, "enabled", false);
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                service.initializeServerCertificate();
                assertThat(Files.exists(tempDir.resolve(KEYSTORE_FILE))).isFalse();
            }
        }

        @Test
        @DisplayName("does nothing without a Pro/Enterprise license")
        void noopWithoutLicense() {
            denyLicense();
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                service.initializeServerCertificate();
                assertThat(Files.exists(tempDir.resolve(KEYSTORE_FILE))).isFalse();
            }
        }

        @Test
        @DisplayName("does not regenerate when keystore exists and regenerateOnStartup is false")
        void keepsExistingKeystore() throws Exception {
            grantProLicense();
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                // First generation
                service.initializeServerCertificate();
                byte[] first = Files.readAllBytes(tempDir.resolve(KEYSTORE_FILE));
                // Second call must not overwrite
                service.initializeServerCertificate();
                byte[] second = Files.readAllBytes(tempDir.resolve(KEYSTORE_FILE));
                assertThat(second).isEqualTo(first);
            }
        }

        @Test
        @DisplayName("regenerates when regenerateOnStartup is true")
        void regeneratesWhenFlagged() throws Exception {
            grantProLicense();
            ReflectionTestUtils.setField(service, "regenerateOnStartup", true);
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                service.initializeServerCertificate();
                assertThat(Files.exists(tempDir.resolve(KEYSTORE_FILE))).isTrue();
                // A regeneration run should still leave a readable keystore
                service.initializeServerCertificate();
                assertThat(Files.exists(tempDir.resolve(KEYSTORE_FILE))).isTrue();
            }
        }
    }

    // -------------------------------------------------------------------------
    @Nested
    @DisplayName("getServerKeyStore")
    class GetKeyStore {

        @Test
        @DisplayName("throws when license is missing")
        void throwsWithoutLicense() {
            denyLicense();
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                assertThatThrownBy(() -> service.getServerKeyStore())
                        .isInstanceOf(IllegalStateException.class)
                        .hasMessageContaining("Pro or Enterprise license");
            }
        }

        @Test
        @DisplayName("throws when no certificate is available")
        void throwsWhenNoCertificate() {
            grantProLicense();
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                assertThatThrownBy(() -> service.getServerKeyStore())
                        .isInstanceOf(IllegalStateException.class)
                        .hasMessageContaining("not available");
            }
        }

        @Test
        @DisplayName("loads the generated keystore with the default password")
        void loadsGeneratedKeystore() throws Exception {
            grantProLicense();
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                service.initializeServerCertificate();
                KeyStore ks = service.getServerKeyStore();
                assertThat(ks).isNotNull();
                assertThat(ks.containsAlias(KEYSTORE_ALIAS)).isTrue();
            }
        }
    }

    // -------------------------------------------------------------------------
    @Nested
    @DisplayName("getServerCertificate / publicKey / info")
    class CertificateAccessors {

        @Test
        @DisplayName("returns the X509 certificate for the standard alias")
        void returnsCertificate() throws Exception {
            grantProLicense();
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                service.initializeServerCertificate();
                X509Certificate cert = service.getServerCertificate();
                assertThat(cert).isNotNull();
                assertThat(cert.getSubjectX500Principal().getName()).contains("Stirling-PDF");
            }
        }

        @Test
        @DisplayName("returns DER-encoded public key bytes")
        void returnsPublicKeyBytes() throws Exception {
            grantProLicense();
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                service.initializeServerCertificate();
                byte[] der = service.getServerCertificatePublicKey();
                assertThat(der).isNotEmpty();
            }
        }

        @Test
        @DisplayName("info reports absent when no certificate exists")
        void infoAbsentWhenMissing() throws Exception {
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                var info = service.getServerCertificateInfo();
                assertThat(info.isExists()).isFalse();
                assertThat(info.getSubject()).isNull();
            }
        }

        @Test
        @DisplayName("info reports subject/issuer/dates when a certificate exists")
        void infoPresentWhenAvailable() throws Exception {
            grantProLicense();
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                service.initializeServerCertificate();
                var info = service.getServerCertificateInfo();
                assertThat(info.isExists()).isTrue();
                assertThat(info.getSubject()).contains("Stirling-PDF");
                assertThat(info.getIssuer()).contains("Stirling-PDF");
                assertThat(info.getValidFrom()).isNotNull();
                assertThat(info.getValidTo()).isNotNull();
            }
        }
    }

    // -------------------------------------------------------------------------
    @Nested
    @DisplayName("uploadServerCertificate")
    class Upload {

        @Test
        @DisplayName("imports a private key entry from an uploaded P12 under the standard alias")
        void importsUploadedKeystore() throws Exception {
            grantProLicense();
            byte[] uploaded = loadCert("valid-test.p12");
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                service.uploadServerCertificate(new ByteArrayInputStream(uploaded), "testpass");

                assertThat(Files.exists(tempDir.resolve(KEYSTORE_FILE))).isTrue();
                KeyStore ks = service.getServerKeyStore();
                assertThat(ks.isKeyEntry(KEYSTORE_ALIAS)).isTrue();
            }
        }

        @Test
        @DisplayName("rejects upload without a Pro/Enterprise license")
        void rejectsWithoutLicense() throws Exception {
            denyLicense();
            byte[] uploaded = loadCert("valid-test.p12");
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                InputStream in = new ByteArrayInputStream(uploaded);
                assertThatThrownBy(() -> service.uploadServerCertificate(in, "testpass"))
                        .isInstanceOf(IllegalStateException.class)
                        .hasMessageContaining("Pro or Enterprise license");
            }
        }

        @Test
        @DisplayName("throws on a wrong upload password")
        void rejectsWrongPassword() throws Exception {
            grantProLicense();
            byte[] uploaded = loadCert("valid-test.p12");
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                InputStream in = new ByteArrayInputStream(uploaded);
                assertThatThrownBy(() -> service.uploadServerCertificate(in, "wrong"))
                        .isInstanceOf(Exception.class);
            }
        }
    }

    // -------------------------------------------------------------------------
    @Nested
    @DisplayName("deleteServerCertificate")
    class Delete {

        @Test
        @DisplayName("deletes an existing keystore file")
        void deletesExisting() throws Exception {
            Files.createFile(tempDir.resolve(KEYSTORE_FILE));
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                service.deleteServerCertificate();
                assertThat(Files.exists(tempDir.resolve(KEYSTORE_FILE))).isFalse();
            }
        }

        @Test
        @DisplayName("is a no-op when the keystore file is absent")
        void noopWhenAbsent() throws Exception {
            try (MockedStatic<InstallationPathConfig> ignored = mockConfigPath()) {
                service.deleteServerCertificate();
                assertThat(Files.exists(tempDir.resolve(KEYSTORE_FILE))).isFalse();
            }
        }
    }

    // -------------------------------------------------------------------------
    private static byte[] loadCert(String filename) throws Exception {
        try (InputStream in =
                ServerCertificateServiceTest.class.getResourceAsStream("/test-certs/" + filename)) {
            if (in == null) {
                throw new IllegalStateException("cert not found: " + filename);
            }
            return in.readAllBytes();
        }
    }
}
