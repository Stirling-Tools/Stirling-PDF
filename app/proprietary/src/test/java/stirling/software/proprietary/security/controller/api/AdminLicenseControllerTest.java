package stirling.software.proprietary.security.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
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
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.configuration.InstallationPathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.GeneralUtils;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier;
import stirling.software.proprietary.security.configuration.ee.KeygenLicenseVerifier.License;
import stirling.software.proprietary.security.configuration.ee.LicenseKeyChecker;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AdminLicenseControllerTest {

    private static final String VALID_CERT =
            "-----BEGIN LICENSE FILE-----\nabc123\n-----END LICENSE FILE-----";

    @Mock private LicenseKeyChecker licenseKeyChecker;
    @Mock private KeygenLicenseVerifier keygenLicenseVerifier;

    private ApplicationProperties applicationProperties;
    private AdminLicenseController controller;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        controller = new AdminLicenseController();
        ReflectionTestUtils.setField(controller, "licenseKeyChecker", licenseKeyChecker);
        ReflectionTestUtils.setField(controller, "keygenLicenseVerifier", keygenLicenseVerifier);
        ReflectionTestUtils.setField(controller, "applicationProperties", applicationProperties);
    }

    private void setChecker(LicenseKeyChecker checker) {
        ReflectionTestUtils.setField(controller, "licenseKeyChecker", checker);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> bodyAsObjectMap(ResponseEntity<Map<String, Object>> resp) {
        return resp.getBody();
    }

    // ----- getInstallationId -----

    @Nested
    @DisplayName("getInstallationId")
    class GetInstallationId {

        @Test
        @DisplayName("returns 200 with the machine fingerprint")
        void returnsFingerprint() {
            try (MockedStatic<GeneralUtils> general = mockStatic(GeneralUtils.class)) {
                general.when(GeneralUtils::generateMachineFingerprint)
                        .thenReturn("FINGERPRINT-123");

                ResponseEntity<Map<String, String>> resp = controller.getInstallationId();

                assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
                assertThat(resp.getBody()).containsEntry("installationId", "FINGERPRINT-123");
            }
        }

        @Test
        @DisplayName("returns 500 with an error body when fingerprint generation throws")
        void fingerprintThrows_returns500() {
            try (MockedStatic<GeneralUtils> general = mockStatic(GeneralUtils.class)) {
                general.when(GeneralUtils::generateMachineFingerprint)
                        .thenThrow(new RuntimeException("boom"));

                ResponseEntity<Map<String, String>> resp = controller.getInstallationId();

                assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
                assertThat(resp.getBody())
                        .containsEntry("error", "Failed to generate installation ID");
            }
        }
    }

    // ----- saveLicenseKey -----

    @Nested
    @DisplayName("saveLicenseKey")
    class SaveLicenseKey {

        @Test
        @DisplayName("returns 400 when licenseKey is null")
        void nullKey_returns400() {
            ResponseEntity<Map<String, Object>> resp =
                    controller.saveLicenseKey(
                            Map.of()); // no "licenseKey" entry -> get returns null

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            Map<String, Object> body = bodyAsObjectMap(resp);
            assertThat(body).containsEntry("success", false);
            assertThat(body).containsEntry("error", "License key is required");
        }

        @Test
        @DisplayName("returns 500 when the license checker bean is not available")
        void checkerNull_returns500() {
            setChecker(null);

            ResponseEntity<Map<String, Object>> resp =
                    controller.saveLicenseKey(Map.of("licenseKey", "abc"));

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            Map<String, Object> body = bodyAsObjectMap(resp);
            assertThat(body).containsEntry("success", false);
            assertThat(body).containsEntry("error", "License checker not available");
        }

        @Test
        @DisplayName("trims the key, activates a premium license and saves settings")
        void validPremiumLicense_savesSettings() throws IOException {
            applicationProperties.getPremium().setMaxUsers(25);
            when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);

            try (MockedStatic<GeneralUtils> general = mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> resp =
                        controller.saveLicenseKey(Map.of("licenseKey", "  mykey  "));

                assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
                Map<String, Object> body = bodyAsObjectMap(resp);
                assertThat(body).containsEntry("success", true);
                assertThat(body).containsEntry("licenseType", "ENTERPRISE");
                assertThat(body).containsEntry("enabled", true);
                assertThat(body).containsEntry("maxUsers", 25);
                assertThat(body).containsEntry("requiresRestart", false);
                assertThat(body).containsEntry("message", "License key saved and activated");

                // key is trimmed before being passed to the checker
                verify(licenseKeyChecker).updateLicenseKey("mykey");
                // premium assumed enabled when setting a key
                assertThat(applicationProperties.getPremium().isEnabled()).isTrue();
                general.verify(() -> GeneralUtils.saveKeyToSettings("premium.enabled", true));
                general.verify(() -> GeneralUtils.saveKeyToSettings("premium.maxUsers", 25));
            }
        }

        @Test
        @DisplayName("NORMAL license result disables premium and clears the enabled flag")
        void normalLicense_disablesPremium() throws IOException {
            when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.NORMAL);

            try (MockedStatic<GeneralUtils> general = mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> resp =
                        controller.saveLicenseKey(Map.of("licenseKey", "freekey"));

                assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
                Map<String, Object> body = bodyAsObjectMap(resp);
                assertThat(body).containsEntry("success", true);
                assertThat(body).containsEntry("licenseType", "NORMAL");

                verify(licenseKeyChecker).updateLicenseKey("freekey");
                general.verify(() -> GeneralUtils.saveKeyToSettings("premium.enabled", false));
                // maxUsers settings should NOT be saved on the NORMAL branch
                general.verify(
                        () -> GeneralUtils.saveKeyToSettings(eq("premium.maxUsers"), any()),
                        never());
            }
        }

        @Test
        @DisplayName("empty string is allowed (clears license) and forwarded as empty after trim")
        void emptyKey_isForwarded() throws IOException {
            when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.NORMAL);

            try (MockedStatic<GeneralUtils> general = mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> resp =
                        controller.saveLicenseKey(Map.of("licenseKey", "   "));

                assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
                verify(licenseKeyChecker).updateLicenseKey("");
            }
        }

        @Test
        @DisplayName("returns 400 when updateLicenseKey throws")
        void updateThrows_returns400() throws IOException {
            doThrow(new IOException("disk full"))
                    .when(licenseKeyChecker)
                    .updateLicenseKey(anyString());

            try (MockedStatic<GeneralUtils> general = mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> resp =
                        controller.saveLicenseKey(Map.of("licenseKey", "boom"));

                assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                Map<String, Object> body = bodyAsObjectMap(resp);
                assertThat(body).containsEntry("success", false);
                assertThat(String.valueOf(body.get("error")))
                        .startsWith("Failed to activate license:");
            }
        }
    }

    // ----- resyncLicense -----

    @Nested
    @DisplayName("resyncLicense")
    class ResyncLicense {

        @Test
        @DisplayName("returns 500 when the license checker bean is not available")
        void checkerNull_returns500() {
            setChecker(null);

            ResponseEntity<Map<String, Object>> resp = controller.resyncLicense();

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            Map<String, Object> body = bodyAsObjectMap(resp);
            assertThat(body).containsEntry("success", false);
            assertThat(body).containsEntry("error", "License checker not available");
        }

        @Test
        @DisplayName("returns 400 when no license key is configured (null)")
        void nullKey_returns400() {
            applicationProperties.getPremium().setKey(null);

            ResponseEntity<Map<String, Object>> resp = controller.resyncLicense();

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            Map<String, Object> body = bodyAsObjectMap(resp);
            assertThat(body).containsEntry("error", "No license key configured");
            verify(licenseKeyChecker, never()).resyncLicense();
        }

        @Test
        @DisplayName("returns 400 when the configured key is blank")
        void blankKey_returns400() {
            applicationProperties.getPremium().setKey("   ");

            ResponseEntity<Map<String, Object>> resp = controller.resyncLicense();

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(bodyAsObjectMap(resp)).containsEntry("error", "No license key configured");
        }

        @Test
        @DisplayName("resyncs and returns the updated license info")
        void success_returnsLicenseInfo() {
            applicationProperties.getPremium().setKey("existing-key");
            applicationProperties.getPremium().setEnabled(true);
            applicationProperties.getPremium().setMaxUsers(50);
            when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);

            ResponseEntity<Map<String, Object>> resp = controller.resyncLicense();

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            Map<String, Object> body = bodyAsObjectMap(resp);
            assertThat(body).containsEntry("success", true);
            assertThat(body).containsEntry("licenseType", "SERVER");
            assertThat(body).containsEntry("enabled", true);
            assertThat(body).containsEntry("maxUsers", 50);
            assertThat(body).containsEntry("message", "License resynced successfully");
            verify(licenseKeyChecker).resyncLicense();
        }

        @Test
        @DisplayName("returns 500 when resyncLicense throws")
        void resyncThrows_returns500() {
            applicationProperties.getPremium().setKey("existing-key");
            doThrow(new RuntimeException("keygen down")).when(licenseKeyChecker).resyncLicense();

            ResponseEntity<Map<String, Object>> resp = controller.resyncLicense();

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            Map<String, Object> body = bodyAsObjectMap(resp);
            assertThat(body).containsEntry("success", false);
            assertThat(String.valueOf(body.get("error"))).startsWith("Failed to resync license:");
        }
    }

    // ----- getLicenseInfo -----

    @Nested
    @DisplayName("getLicenseInfo")
    class GetLicenseInfo {

        @Test
        @DisplayName("uses the checker result and includes the key when present")
        void withCheckerAndKey() {
            applicationProperties.getPremium().setKey("some-key");
            applicationProperties.getPremium().setEnabled(true);
            applicationProperties.getPremium().setMaxUsers(7);
            when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);

            ResponseEntity<Map<String, Object>> resp = controller.getLicenseInfo();

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            Map<String, Object> body = bodyAsObjectMap(resp);
            assertThat(body).containsEntry("licenseType", "ENTERPRISE");
            assertThat(body).containsEntry("enabled", true);
            assertThat(body).containsEntry("maxUsers", 7);
            assertThat(body).containsEntry("hasKey", true);
            assertThat(body).containsEntry("licenseKey", "some-key");
        }

        @Test
        @DisplayName("falls back to NORMAL and omits the key when checker is null and no key set")
        void checkerNullNoKey() {
            setChecker(null);
            applicationProperties.getPremium().setKey(null);

            ResponseEntity<Map<String, Object>> resp = controller.getLicenseInfo();

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
            Map<String, Object> body = bodyAsObjectMap(resp);
            assertThat(body).containsEntry("licenseType", "NORMAL");
            assertThat(body).containsEntry("hasKey", false);
            assertThat(body).doesNotContainKey("licenseKey");
        }

        @Test
        @DisplayName("blank key counts as no key and is not echoed back")
        void blankKey_notEchoed() {
            applicationProperties.getPremium().setKey("   ");
            when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.NORMAL);

            ResponseEntity<Map<String, Object>> resp = controller.getLicenseInfo();

            Map<String, Object> body = bodyAsObjectMap(resp);
            assertThat(body).containsEntry("hasKey", false);
            assertThat(body).doesNotContainKey("licenseKey");
        }

        @Test
        @DisplayName("returns 500 when reading license status throws")
        void throws_returns500() {
            when(licenseKeyChecker.getPremiumLicenseEnabledResult())
                    .thenThrow(new RuntimeException("bad state"));

            ResponseEntity<Map<String, Object>> resp = controller.getLicenseInfo();

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            assertThat(bodyAsObjectMap(resp))
                    .containsEntry("error", "Failed to retrieve license information");
        }
    }

    // ----- uploadLicenseFile -----

    @Nested
    @DisplayName("uploadLicenseFile")
    class UploadLicenseFile {

        @Test
        @DisplayName("returns 400 when the file is null")
        void nullFile_returns400() {
            ResponseEntity<Map<String, Object>> resp = controller.uploadLicenseFile(null);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(bodyAsObjectMap(resp)).containsEntry("error", "File is empty");
        }

        @Test
        @DisplayName("returns 400 when the file is empty")
        void emptyFile_returns400() {
            MockMultipartFile file =
                    new MockMultipartFile("file", "license.lic", "text/plain", new byte[0]);

            ResponseEntity<Map<String, Object>> resp = controller.uploadLicenseFile(file);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(bodyAsObjectMap(resp)).containsEntry("error", "File is empty");
        }

        @Test
        @DisplayName("returns 400 when the filename is null")
        void nullFilename_returns400() {
            MockMultipartFile file =
                    new MockMultipartFile("file", null, "text/plain", VALID_CERT.getBytes());

            ResponseEntity<Map<String, Object>> resp = controller.uploadLicenseFile(file);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(bodyAsObjectMap(resp)).containsEntry("error", "Invalid filename");
        }

        @Test
        @DisplayName("returns 400 when the filename contains '..'")
        void parentTraversal_returns400() {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "file", "..license.lic", "text/plain", VALID_CERT.getBytes());

            ResponseEntity<Map<String, Object>> resp = controller.uploadLicenseFile(file);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(String.valueOf(bodyAsObjectMap(resp).get("error")))
                    .contains("path separators or '..'");
        }

        @Test
        @DisplayName("returns 400 when the filename contains a forward slash")
        void forwardSlash_returns400() {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "file", "sub/license.lic", "text/plain", VALID_CERT.getBytes());

            ResponseEntity<Map<String, Object>> resp = controller.uploadLicenseFile(file);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(String.valueOf(bodyAsObjectMap(resp).get("error")))
                    .contains("path separators or '..'");
        }

        @Test
        @DisplayName("returns 400 when the filename contains a backslash")
        void backslash_returns400() {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "file", "sub\\license.lic", "text/plain", VALID_CERT.getBytes());

            ResponseEntity<Map<String, Object>> resp = controller.uploadLicenseFile(file);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(String.valueOf(bodyAsObjectMap(resp).get("error")))
                    .contains("path separators or '..'");
        }

        @Test
        @DisplayName("returns 400 for an unsupported file extension")
        void badExtension_returns400() {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "file", "license.txt", "text/plain", VALID_CERT.getBytes());

            ResponseEntity<Map<String, Object>> resp = controller.uploadLicenseFile(file);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(String.valueOf(bodyAsObjectMap(resp).get("error")))
                    .contains("Expected .lic or .cert");
        }

        @Test
        @DisplayName("returns 400 when the file exceeds the 1MB limit")
        void tooLarge_returns400() {
            byte[] big = new byte[1_048_577];
            // ensure a valid header so we only trip the size check
            byte[] header = VALID_CERT.getBytes(StandardCharsets.UTF_8);
            System.arraycopy(header, 0, big, 0, header.length);
            MockMultipartFile file =
                    new MockMultipartFile("file", "license.lic", "text/plain", big);

            ResponseEntity<Map<String, Object>> resp = controller.uploadLicenseFile(file);

            assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(String.valueOf(bodyAsObjectMap(resp).get("error")))
                    .contains("File too large");
        }

        @Test
        @DisplayName("returns 400 when the certificate header is missing")
        void invalidCertHeader_returns400(@TempDir Path tempDir) {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "file", "license.lic", "text/plain", "not a license".getBytes());

            try (MockedStatic<InstallationPathConfig> paths =
                    mockStatic(InstallationPathConfig.class)) {
                paths.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());

                ResponseEntity<Map<String, Object>> resp = controller.uploadLicenseFile(file);

                assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                assertThat(bodyAsObjectMap(resp))
                        .containsEntry("error", "Invalid license certificate format");
            }
        }

        @Test
        @DisplayName("writes the file, activates the license and returns success (.lic)")
        void validUpload_writesFileAndActivates(@TempDir Path tempDir) throws IOException {
            applicationProperties.getPremium().setMaxUsers(99);
            MockMultipartFile file =
                    new MockMultipartFile(
                            "file",
                            "license.lic",
                            "text/plain",
                            VALID_CERT.getBytes(StandardCharsets.UTF_8));
            when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);

            try (MockedStatic<InstallationPathConfig> paths =
                    mockStatic(InstallationPathConfig.class)) {
                paths.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());

                ResponseEntity<Map<String, Object>> resp = controller.uploadLicenseFile(file);

                assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
                Map<String, Object> body = bodyAsObjectMap(resp);
                assertThat(body).containsEntry("success", true);
                assertThat(body).containsEntry("licenseType", "SERVER");
                assertThat(body).containsEntry("filename", "license.lic");
                assertThat(body).containsEntry("filePath", "configs/license.lic");
                assertThat(body).containsEntry("enabled", true);
                assertThat(body).containsEntry("maxUsers", 99);
                assertThat(body).containsEntry("message", "License file uploaded and activated");

                // file actually written into the config dir
                Path written = tempDir.resolve("license.lic");
                assertThat(Files.exists(written)).isTrue();
                assertThat(Files.readString(written)).isEqualTo(VALID_CERT);

                // license updated with a relative file reference
                verify(licenseKeyChecker).updateLicenseKey("file:configs/license.lic");
                assertThat(applicationProperties.getPremium().isEnabled()).isTrue();
            }
        }

        @Test
        @DisplayName("accepts the .cert extension (case-insensitive)")
        void certExtension_isAccepted(@TempDir Path tempDir) throws IOException {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "file",
                            "License.CERT",
                            "text/plain",
                            VALID_CERT.getBytes(StandardCharsets.UTF_8));
            when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.ENTERPRISE);

            try (MockedStatic<InstallationPathConfig> paths =
                    mockStatic(InstallationPathConfig.class)) {
                paths.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());

                ResponseEntity<Map<String, Object>> resp = controller.uploadLicenseFile(file);

                assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
                assertThat(bodyAsObjectMap(resp)).containsEntry("filename", "License.CERT");
                assertThat(Files.exists(tempDir.resolve("License.CERT"))).isTrue();
            }
        }

        @Test
        @DisplayName("backs up an existing license file before overwriting it")
        void existingFile_isBackedUp(@TempDir Path tempDir) throws IOException {
            // pre-existing license file at the target path
            Path existing = tempDir.resolve("license.lic");
            Files.writeString(existing, "old-content");

            MockMultipartFile file =
                    new MockMultipartFile(
                            "file",
                            "license.lic",
                            "text/plain",
                            VALID_CERT.getBytes(StandardCharsets.UTF_8));
            when(licenseKeyChecker.getPremiumLicenseEnabledResult()).thenReturn(License.SERVER);

            try (MockedStatic<InstallationPathConfig> paths =
                    mockStatic(InstallationPathConfig.class)) {
                paths.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());

                ResponseEntity<Map<String, Object>> resp = controller.uploadLicenseFile(file);

                assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
                // new content written
                assertThat(Files.readString(existing)).isEqualTo(VALID_CERT);
                // a backup directory with one .bak file was created
                Path backupDir = tempDir.resolve("backup");
                assertThat(Files.isDirectory(backupDir)).isTrue();
                try (var stream = Files.list(backupDir)) {
                    assertThat(
                                    stream.anyMatch(
                                            p ->
                                                    p.getFileName()
                                                            .toString()
                                                            .startsWith("license.lic.bak.")))
                            .isTrue();
                }
            }
        }

        @Test
        @DisplayName("returns 400 when license activation throws after writing the file")
        void activationThrows_returns400(@TempDir Path tempDir) throws IOException {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "file",
                            "license.lic",
                            "text/plain",
                            VALID_CERT.getBytes(StandardCharsets.UTF_8));
            doThrow(new IllegalStateException("invalid key"))
                    .when(licenseKeyChecker)
                    .updateLicenseKey(anyString());

            try (MockedStatic<InstallationPathConfig> paths =
                    mockStatic(InstallationPathConfig.class)) {
                paths.when(InstallationPathConfig::getConfigPath).thenReturn(tempDir.toString());

                ResponseEntity<Map<String, Object>> resp = controller.uploadLicenseFile(file);

                assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                Map<String, Object> body = bodyAsObjectMap(resp);
                assertThat(body).containsEntry("success", false);
                assertThat(String.valueOf(body.get("error")))
                        .startsWith("Failed to activate license:");
            }
        }
    }
}
