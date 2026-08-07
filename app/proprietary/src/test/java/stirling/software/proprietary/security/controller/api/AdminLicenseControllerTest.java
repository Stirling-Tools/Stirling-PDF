package stirling.software.proprietary.security.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

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
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.GeneralUtils;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AdminLicenseControllerTest {

    @Mock private LicenseKeyChecker licenseKeyChecker;

    @Mock
    private stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier
            keygenLicenseVerifier;

    private ApplicationProperties applicationProperties;

    private AdminLicenseController controller;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        controller = new AdminLicenseController();
        org.springframework.test.util.ReflectionTestUtils.setField(
                controller, "licenseKeyChecker", licenseKeyChecker);
        org.springframework.test.util.ReflectionTestUtils.setField(
                controller, "keygenLicenseVerifier", keygenLicenseVerifier);
        org.springframework.test.util.ReflectionTestUtils.setField(
                controller, "applicationProperties", applicationProperties);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> body(ResponseEntity<Map<String, Object>> response) {
        return response.getBody();
    }

    @Nested
    @DisplayName("getInstallationId")
    class GetInstallationId {

        @Test
        @DisplayName("returns 200 with the machine fingerprint")
        void returnsFingerprint() {
            try (MockedStatic<GeneralUtils> mocked = mockStatic(GeneralUtils.class)) {
                mocked.when(GeneralUtils::generateMachineFingerprint).thenReturn("fingerprint-xyz");

                ResponseEntity<Map<String, String>> response = controller.getInstallationId();

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                assertThat(response.getBody()).containsEntry("installationId", "fingerprint-xyz");
            }
        }

        @Test
        @DisplayName("returns 500 when fingerprint generation throws")
        void returnsErrorOnException() {
            try (MockedStatic<GeneralUtils> mocked = mockStatic(GeneralUtils.class)) {
                mocked.when(GeneralUtils::generateMachineFingerprint)
                        .thenThrow(new RuntimeException("boom"));

                ResponseEntity<Map<String, String>> response = controller.getInstallationId();

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
                assertThat(response.getBody()).containsKey("error");
            }
        }
    }

    @Nested
    @DisplayName("saveLicenseKey")
    class SaveLicenseKey {

        @Test
        @DisplayName("null license key returns 400")
        void nullKey_returnsBadRequest() {
            ResponseEntity<Map<String, Object>> response = controller.saveLicenseKey(Map.of());

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(body(response)).containsEntry("success", false);
        }

        @Test
        @DisplayName("valid license key activates and returns licenseType")
        void validKey_activates() throws IOException {
            applicationProperties.getPremium().setMaxUsers(10);
            when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);

            try (MockedStatic<GeneralUtils> mocked = mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> response =
                        controller.saveLicenseKey(Map.of("licenseKey", "  some-key  "));

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                assertThat(body(response)).containsEntry("success", true);
                assertThat(body(response)).containsEntry("licenseType", "ENTERPRISE");
                assertThat(applicationProperties.getPremium().isEnabled()).isTrue();
            }
        }

        @Test
        @DisplayName("NORMAL license disables premium features")
        void normalKey_disablesPremium() throws IOException {
            when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.NORMAL);

            try (MockedStatic<GeneralUtils> mocked = mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> response =
                        controller.saveLicenseKey(Map.of("licenseKey", "free"));

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                assertThat(body(response)).containsEntry("licenseType", "NORMAL");
                mocked.verify(() -> GeneralUtils.saveKeyToSettings("premium.enabled", false));
            }
        }

        @Test
        @DisplayName("returns 500 when license checker is unavailable")
        void checkerUnavailable_returnsError() {
            org.springframework.test.util.ReflectionTestUtils.setField(
                    controller, "licenseKeyChecker", null);

            ResponseEntity<Map<String, Object>> response =
                    controller.saveLicenseKey(Map.of("licenseKey", "x"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(body(response)).containsEntry("success", false);
        }

        @Test
        @DisplayName("returns 400 when activation throws")
        void activationThrows_returnsBadRequest() throws IOException {
            doThrow(new IOException("disk full"))
                    .when(licenseKeyChecker)
                    .updateLicenseKey(anyString());

            try (MockedStatic<GeneralUtils> mocked = mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> response =
                        controller.saveLicenseKey(Map.of("licenseKey", "x"));

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                assertThat(body(response)).containsEntry("success", false);
            }
        }
    }

    @Nested
    @DisplayName("resyncLicense")
    class ResyncLicense {

        @Test
        @DisplayName("returns 500 when checker unavailable")
        void checkerUnavailable_returnsError() {
            org.springframework.test.util.ReflectionTestUtils.setField(
                    controller, "licenseKeyChecker", null);

            ResponseEntity<Map<String, Object>> response = controller.resyncLicense();

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(body(response)).containsEntry("success", false);
        }

        @Test
        @DisplayName("returns 400 when no license key is configured")
        void noKey_returnsBadRequest() {
            applicationProperties.getPremium().setKey("   ");

            ResponseEntity<Map<String, Object>> response = controller.resyncLicense();

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(body(response)).containsEntry("success", false);
        }

        @Test
        @DisplayName("resyncs successfully and returns updated info")
        void resync_success() {
            applicationProperties.getPremium().setKey("real-key");
            applicationProperties.getPremium().setMaxUsers(3);
            when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);

            ResponseEntity<Map<String, Object>> response = controller.resyncLicense();

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(body(response)).containsEntry("success", true);
            assertThat(body(response)).containsEntry("licenseType", "SERVER");
            assertThat(body(response)).containsEntry("maxUsers", 3);
        }

        @Test
        @DisplayName("returns 500 when resync throws")
        void resyncThrows_returnsError() {
            applicationProperties.getPremium().setKey("real-key");
            doThrow(new RuntimeException("api down")).when(licenseKeyChecker).resyncLicense();

            ResponseEntity<Map<String, Object>> response = controller.resyncLicense();

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(body(response)).containsEntry("success", false);
        }
    }

    @Nested
    @DisplayName("getLicenseInfo")
    class GetLicenseInfo {

        @Test
        @DisplayName("returns license type and key when key present")
        void withKey_returnsInfo() {
            applicationProperties.getPremium().setEnabled(true);
            applicationProperties.getPremium().setKey("my-key");
            applicationProperties.getPremium().setMaxUsers(7);
            when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);

            ResponseEntity<Map<String, Object>> response = controller.getLicenseInfo();

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(body(response)).containsEntry("licenseType", "ENTERPRISE");
            assertThat(body(response)).containsEntry("hasKey", true);
            assertThat(body(response)).containsEntry("licenseKey", "my-key");
        }

        @Test
        @DisplayName("returns NORMAL with hasKey false when no checker and no key")
        void noCheckerNoKey_returnsNormal() {
            org.springframework.test.util.ReflectionTestUtils.setField(
                    controller, "licenseKeyChecker", null);

            ResponseEntity<Map<String, Object>> response = controller.getLicenseInfo();

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(body(response)).containsEntry("licenseType", "NORMAL");
            assertThat(body(response)).containsEntry("hasKey", false);
            assertThat(body(response)).doesNotContainKey("licenseKey");
        }
    }

    @Nested
    @DisplayName("uploadLicenseFile")
    class UploadLicenseFile {

        @Test
        @DisplayName("empty file returns 400")
        void emptyFile_returnsBadRequest() {
            MultipartFile file = new MockMultipartFile("file", "license.lic", null, new byte[0]);

            ResponseEntity<Map<String, Object>> response = controller.uploadLicenseFile(file);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(body(response)).containsEntry("success", false);
        }

        @Test
        @DisplayName("filename with path separators is rejected")
        void pathTraversalFilename_rejected() {
            MultipartFile file =
                    new MockMultipartFile(
                            "file", "../evil.lic", null, "data".getBytes(StandardCharsets.UTF_8));

            ResponseEntity<Map<String, Object>> response = controller.uploadLicenseFile(file);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(body(response)).containsEntry("success", false);
        }

        @Test
        @DisplayName("invalid extension is rejected")
        void invalidExtension_rejected() {
            MultipartFile file =
                    new MockMultipartFile(
                            "file", "license.txt", null, "data".getBytes(StandardCharsets.UTF_8));

            ResponseEntity<Map<String, Object>> response = controller.uploadLicenseFile(file);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(body(response)).containsEntry("success", false);
        }

        @Test
        @DisplayName("file over 1MB is rejected")
        void tooLarge_rejected() {
            byte[] large = new byte[1_048_577];
            MultipartFile file = new MockMultipartFile("file", "license.cert", null, large);

            ResponseEntity<Map<String, Object>> response = controller.uploadLicenseFile(file);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(body(response)).containsEntry("success", false);
        }

        @Test
        @DisplayName("content without certificate header is rejected")
        void invalidHeader_rejected() {
            MultipartFile file =
                    new MockMultipartFile(
                            "file",
                            "license.lic",
                            null,
                            "not a certificate".getBytes(StandardCharsets.UTF_8));

            ResponseEntity<Map<String, Object>> response = controller.uploadLicenseFile(file);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(body(response)).containsEntry("success", false);
        }

        @Test
        @DisplayName("valid certificate file is saved and activated")
        void validFile_savedAndActivated(@TempDir Path tempDir) throws IOException {
            String content = "-----BEGIN LICENSE FILE-----\nABC123\n-----END LICENSE FILE-----";
            MultipartFile file =
                    new MockMultipartFile(
                            "file", "license.lic", null, content.getBytes(StandardCharsets.UTF_8));
            when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);

            try (MockedStatic<InstallationPathConfig> mocked =
                    mockStatic(InstallationPathConfig.class)) {
                mocked.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());

                ResponseEntity<Map<String, Object>> response = controller.uploadLicenseFile(file);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                assertThat(body(response)).containsEntry("success", true);
                assertThat(body(response)).containsEntry("licenseType", "SERVER");
                assertThat(body(response)).containsEntry("filename", "license.lic");
                assertThat(Files.exists(tempDir.resolve("license.lic"))).isTrue();
            }
        }

        @Test
        @DisplayName("existing license file is backed up before overwrite")
        void existingFile_backedUp(@TempDir Path tempDir) throws IOException {
            Path existing = tempDir.resolve("license.cert");
            Files.writeString(existing, "old-content");

            String content = "-----BEGIN LICENSE FILE-----\nNEW\n-----END LICENSE FILE-----";
            MultipartFile file =
                    new MockMultipartFile(
                            "file", "license.cert", null, content.getBytes(StandardCharsets.UTF_8));
            when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);

            try (MockedStatic<InstallationPathConfig> mocked =
                    mockStatic(InstallationPathConfig.class)) {
                mocked.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());

                ResponseEntity<Map<String, Object>> response = controller.uploadLicenseFile(file);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                Path backupDir = tempDir.resolve("backup");
                assertThat(Files.list(backupDir).count()).isGreaterThan(0);
            }
        }

        @Test
        @DisplayName("activation failure after save returns 400")
        void activationThrows_returnsBadRequest(@TempDir Path tempDir) throws IOException {
            String content = "-----BEGIN LICENSE FILE-----\nX\n-----END LICENSE FILE-----";
            MultipartFile file =
                    new MockMultipartFile(
                            "file", "license.lic", null, content.getBytes(StandardCharsets.UTF_8));
            doThrow(new RuntimeException("bad license"))
                    .when(licenseKeyChecker)
                    .updateLicenseKey(any());

            try (MockedStatic<InstallationPathConfig> mocked =
                    mockStatic(InstallationPathConfig.class)) {
                mocked.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());

                ResponseEntity<Map<String, Object>> response = controller.uploadLicenseFile(file);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                assertThat(body(response)).containsEntry("success", false);
            }
        }
    }
}
