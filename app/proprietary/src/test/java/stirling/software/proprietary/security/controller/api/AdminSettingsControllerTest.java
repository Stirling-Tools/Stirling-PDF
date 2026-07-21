package stirling.software.proprietary.security.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mockStatic;

import java.io.IOException;
import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationContext;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.GeneralUtils;
import stirling.software.proprietary.security.model.api.admin.SettingValueResponse;
import stirling.software.proprietary.security.model.api.admin.UpdateSettingValueRequest;
import stirling.software.proprietary.security.model.api.admin.UpdateSettingsRequest;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
@DisplayName("AdminSettingsController")
class AdminSettingsControllerTest {

    private ApplicationProperties applicationProperties;
    private ObjectMapper objectMapper;
    private ApplicationContext applicationContext;

    private AdminSettingsController controller;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        objectMapper = JsonMapper.builder().build();
        applicationContext = org.mockito.Mockito.mock(ApplicationContext.class);
        controller =
                new AdminSettingsController(
                        applicationProperties, objectMapper, applicationContext);
        clearPendingChanges();
    }

    @AfterEach
    void tearDown() {
        clearPendingChanges();
    }

    // pendingChanges is a static map shared across instances; reset between tests.
    @SuppressWarnings("unchecked")
    private void clearPendingChanges() {
        try {
            Field field = AdminSettingsController.class.getDeclaredField("pendingChanges");
            field.setAccessible(true);
            ((ConcurrentHashMap<String, Object>) field.get(null)).clear();
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
    }

    @SuppressWarnings("unchecked")
    private void putPending(String key, Object value) {
        try {
            Field field = AdminSettingsController.class.getDeclaredField("pendingChanges");
            field.setAccessible(true);
            ((ConcurrentHashMap<String, Object>) field.get(null)).put(key, value);
        } catch (ReflectiveOperationException e) {
            throw new RuntimeException(e);
        }
    }

    @Nested
    @DisplayName("getSettings")
    class GetSettings {

        @Test
        @DisplayName("returns full settings map without pending changes")
        void returnsSettings() {
            ResponseEntity<?> response = controller.getSettings(false);

            assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
            assertThat(response.getBody()).isInstanceOf(Map.class);
            @SuppressWarnings("unchecked")
            Map<String, Object> body = (Map<String, Object>) response.getBody();
            assertThat(body).containsKey("security");
            assertThat(body).containsKey("system");
        }

        @Test
        @DisplayName("merges pending changes when includePending is true")
        void mergesPendingChanges() {
            putPending("ui.logoStyle", "modern");

            ResponseEntity<?> response = controller.getSettings(true);

            assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
            Map<?, ?> body = (Map<?, ?>) response.getBody();
            Map<?, ?> ui = (Map<?, ?>) body.get("ui");
            assertThat(ui.get("logoStyle")).isEqualTo("modern");
        }

        @Test
        @DisplayName("masks sensitive password fields")
        void masksSensitiveFields() {
            applicationProperties.getMail().setPassword("supersecret");

            ResponseEntity<?> response = controller.getSettings(false);

            Map<?, ?> body = (Map<?, ?>) response.getBody();
            Map<?, ?> mail = (Map<?, ?>) body.get("mail");
            assertThat(mail.get("password")).isEqualTo("********");
        }
    }

    @Nested
    @DisplayName("getSettingsDelta")
    class GetSettingsDelta {

        @Test
        @DisplayName("reports no pending changes when empty")
        void emptyDelta() {
            ResponseEntity<?> response = controller.getSettingsDelta();

            Map<?, ?> body = (Map<?, ?>) response.getBody();
            assertThat(body.get("hasPendingChanges")).isEqualTo(false);
            assertThat(body.get("count")).isEqualTo(0);
        }

        @Test
        @DisplayName("reports pending changes with count")
        void withPending() {
            putPending("ui.appName", "Foo");
            putPending("system.enableAnalytics", false);

            ResponseEntity<?> response = controller.getSettingsDelta();

            Map<?, ?> body = (Map<?, ?>) response.getBody();
            assertThat(body.get("hasPendingChanges")).isEqualTo(true);
            assertThat(body.get("count")).isEqualTo(2);
        }
    }

    @Nested
    @DisplayName("updateSettings")
    class UpdateSettings {

        @Test
        @DisplayName("rejects null settings map with 400")
        void rejectsNull() {
            UpdateSettingsRequest request = new UpdateSettingsRequest();
            request.setSettings(null);

            ResponseEntity<Map<String, Object>> response = controller.updateSettings(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody()).containsKey("error");
        }

        @Test
        @DisplayName("rejects empty settings map with 400")
        void rejectsEmpty() {
            UpdateSettingsRequest request = new UpdateSettingsRequest();
            request.setSettings(Map.of());

            ResponseEntity<Map<String, Object>> response = controller.updateSettings(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        @DisplayName("rejects invalid setting key format with 400")
        void rejectsInvalidKey() {
            UpdateSettingsRequest request = new UpdateSettingsRequest();
            request.setSettings(Map.of("bad key with spaces", "x"));

            ResponseEntity<Map<String, Object>> response = controller.updateSettings(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody().get("error").toString()).contains("Invalid setting key");
        }

        @Test
        @DisplayName("rejects unknown section prefix with 400")
        void rejectsUnknownSection() {
            UpdateSettingsRequest request = new UpdateSettingsRequest();
            request.setSettings(Map.of("nope.value", "x"));

            ResponseEntity<Map<String, Object>> response = controller.updateSettings(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        @DisplayName("rejects duplicate watched-folder paths with 400")
        void rejectsDuplicatePaths() {
            UpdateSettingsRequest request = new UpdateSettingsRequest();
            request.setSettings(
                    Map.of(
                            "system.customPaths.pipeline.watchedFoldersDirs",
                            List.of("/tmp/a", "/tmp/a")));

            ResponseEntity<Map<String, Object>> response = controller.updateSettings(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody().get("error").toString()).contains("Duplicate");
        }

        @Test
        @DisplayName("rejects overlapping watched-folder paths with 400")
        void rejectsOverlappingPaths() {
            UpdateSettingsRequest request = new UpdateSettingsRequest();
            request.setSettings(
                    Map.of(
                            "system.customPaths.pipeline.watchedFoldersDirs",
                            List.of("/tmp/parent", "/tmp/parent/child")));

            ResponseEntity<Map<String, Object>> response = controller.updateSettings(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody().get("error").toString()).contains("Overlapping");
        }

        @Test
        @DisplayName("applies valid settings and tracks them as pending")
        void appliesValidSettings() {
            UpdateSettingsRequest request = new UpdateSettingsRequest();
            request.setSettings(Map.of("ui.appName", "My App"));

            try (MockedStatic<GeneralUtils> mocked = mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> response = controller.updateSettings(request);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                assertThat(response.getBody().get("message").toString()).contains("Successfully");
                mocked.verify(
                        () -> GeneralUtils.updateSettingsTransactional(request.getSettings()));
            }
        }

        @Test
        @DisplayName("returns 500 when persistence throws IOException")
        void persistenceIOException() {
            UpdateSettingsRequest request = new UpdateSettingsRequest();
            request.setSettings(Map.of("ui.appName", "My App"));

            try (MockedStatic<GeneralUtils> mocked = mockStatic(GeneralUtils.class)) {
                mocked.when(() -> GeneralUtils.updateSettingsTransactional(request.getSettings()))
                        .thenThrow(new IOException("disk full"));

                ResponseEntity<Map<String, Object>> response = controller.updateSettings(request);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            }
        }

        @Test
        @DisplayName("returns 400 when persistence throws IllegalArgumentException")
        void persistenceIllegalArgument() {
            UpdateSettingsRequest request = new UpdateSettingsRequest();
            request.setSettings(Map.of("ui.appName", "My App"));

            try (MockedStatic<GeneralUtils> mocked = mockStatic(GeneralUtils.class)) {
                mocked.when(() -> GeneralUtils.updateSettingsTransactional(request.getSettings()))
                        .thenThrow(new IllegalArgumentException("bad"));

                ResponseEntity<Map<String, Object>> response = controller.updateSettings(request);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            }
        }
    }

    @Nested
    @DisplayName("getSettingsSection")
    class GetSettingsSection {

        @Test
        @DisplayName("returns 400 for invalid section name")
        void invalidSection() {
            ResponseEntity<?> response = controller.getSettingsSection("nonsense", true);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody().toString()).contains("Invalid section name");
        }

        @Test
        @DisplayName("returns section data for valid section")
        void validSection() {
            ResponseEntity<?> response = controller.getSettingsSection("security", false);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isInstanceOf(Map.class);
        }

        @Test
        @DisplayName("adds _pending block when section has pending changes")
        void includesPending() {
            putPending("ui.appName", "Pending App");

            ResponseEntity<?> response = controller.getSettingsSection("ui", true);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            @SuppressWarnings("unchecked")
            Map<String, Object> body = (Map<String, Object>) response.getBody();
            assertThat(body).containsKey("_pending");
        }
    }

    @Nested
    @DisplayName("updateSettingsSection")
    class UpdateSettingsSection {

        @Test
        @DisplayName("rejects null section data with 400")
        void rejectsNull() {
            ResponseEntity<Map<String, Object>> response =
                    controller.updateSettingsSection("security", null);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        @DisplayName("rejects invalid section name with 400")
        void rejectsInvalidSection() {
            ResponseEntity<Map<String, Object>> response =
                    controller.updateSettingsSection("bogus", Map.of("foo", "bar"));

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody().get("error").toString()).contains("Invalid section name");
        }

        @Test
        @DisplayName("updates valid section settings and tracks pending")
        void updatesValidSection() {
            try (MockedStatic<GeneralUtils> mocked = mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> response =
                        controller.updateSettingsSection(
                                "ui", new java.util.HashMap<>(Map.of("appName", "New")));

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                assertThat(response.getBody().get("message").toString()).contains("Successfully");
                mocked.verify(() -> GeneralUtils.saveKeyToSettings("ui.appName", "New"));
            }
        }

        @Test
        @DisplayName("auto-enables premium when license key provided")
        void autoEnablesPremium() {
            java.util.Map<String, Object> section = new java.util.HashMap<>();
            section.put("key", "license-123");

            try (MockedStatic<GeneralUtils> mocked = mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> response =
                        controller.updateSettingsSection("premium", section);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                // enabled flag auto-added and persisted
                mocked.verify(() -> GeneralUtils.saveKeyToSettings("premium.enabled", true));
            }
        }

        @Test
        @DisplayName("returns 500 when persistence throws IOException")
        void persistenceIOException() {
            try (MockedStatic<GeneralUtils> mocked = mockStatic(GeneralUtils.class)) {
                mocked.when(() -> GeneralUtils.saveKeyToSettings("ui.appName", "New"))
                        .thenThrow(new IOException("io"));

                ResponseEntity<Map<String, Object>> response =
                        controller.updateSettingsSection(
                                "ui", new java.util.HashMap<>(Map.of("appName", "New")));

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            }
        }
    }

    @Nested
    @DisplayName("getSettingValue")
    class GetSettingValue {

        @Test
        @DisplayName("returns 400 for invalid key format")
        void invalidKey() {
            ResponseEntity<?> response = controller.getSettingValue("bad key");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody().toString()).contains("Invalid setting key");
        }

        @Test
        @DisplayName("returns 400 when key not found")
        void keyNotFound() {
            ResponseEntity<?> response = controller.getSettingValue("ui.nonExistentProperty");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody().toString()).contains("not found");
        }

        @Test
        @DisplayName("returns value for an existing key")
        void existingKey() {
            applicationProperties.getUi().setLogoStyle("modern");

            ResponseEntity<?> response = controller.getSettingValue("ui.logoStyle");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            SettingValueResponse body = (SettingValueResponse) response.getBody();
            assertThat(body.getKey()).isEqualTo("ui.logoStyle");
            assertThat(body.getValue()).isEqualTo("modern");
        }

        @Test
        @DisplayName("masks sensitive value for an existing secret key")
        void masksSecret() {
            applicationProperties.getMail().setPassword("secretval");

            ResponseEntity<?> response = controller.getSettingValue("mail.password");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            SettingValueResponse body = (SettingValueResponse) response.getBody();
            assertThat(body.getValue()).isEqualTo("********");
        }
    }

    @Nested
    @DisplayName("updateSettingValue")
    class UpdateSettingValue {

        @Test
        @DisplayName("returns 400 for invalid key format")
        void invalidKey() {
            UpdateSettingValueRequest request = new UpdateSettingValueRequest();
            request.setValue("x");

            ResponseEntity<String> response = controller.updateSettingValue("bad key", request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        @DisplayName("blocks saving masked value for sensitive field")
        void blocksMaskedSensitive() {
            UpdateSettingValueRequest request = new UpdateSettingValueRequest();
            request.setValue("********");

            ResponseEntity<String> response =
                    controller.updateSettingValue("mail.password", request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody()).contains("Cannot save masked");
        }

        @Test
        @DisplayName("saves a valid value and tracks pending")
        void savesValue() {
            UpdateSettingValueRequest request = new UpdateSettingValueRequest();
            request.setValue("Renamed");

            try (MockedStatic<GeneralUtils> mocked = mockStatic(GeneralUtils.class)) {
                ResponseEntity<String> response =
                        controller.updateSettingValue("ui.appName", request);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                assertThat(response.getBody()).contains("Successfully updated");
                mocked.verify(() -> GeneralUtils.saveKeyToSettings("ui.appName", "Renamed"));
            }
        }

        @Test
        @DisplayName("returns 500 when persistence throws IOException")
        void persistenceIOException() {
            UpdateSettingValueRequest request = new UpdateSettingValueRequest();
            request.setValue("Renamed");

            try (MockedStatic<GeneralUtils> mocked = mockStatic(GeneralUtils.class)) {
                mocked.when(() -> GeneralUtils.saveKeyToSettings("ui.appName", "Renamed"))
                        .thenThrow(new IOException("io"));

                ResponseEntity<String> response =
                        controller.updateSettingValue("ui.appName", request);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
            }
        }
    }

    @Nested
    @DisplayName("restartApplication")
    class RestartApplication {

        @Test
        @DisplayName("returns 503 when not running from a JAR (dev mode)")
        void devModeUnavailable() {
            try (MockedStatic<stirling.software.common.util.JarPathUtil> jar =
                    mockStatic(stirling.software.common.util.JarPathUtil.class)) {
                jar.when(stirling.software.common.util.JarPathUtil::currentJar).thenReturn(null);

                ResponseEntity<Map<String, Object>> response = controller.restartApplication();

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                assertThat(response.getBody().get("error").toString()).contains("development mode");
            }
        }

        @Test
        @DisplayName("returns 503 when restart helper jar is missing")
        void helperMissing() {
            try (MockedStatic<stirling.software.common.util.JarPathUtil> jar =
                    mockStatic(stirling.software.common.util.JarPathUtil.class)) {
                jar.when(stirling.software.common.util.JarPathUtil::currentJar)
                        .thenReturn(java.nio.file.Path.of("app.jar"));
                jar.when(stirling.software.common.util.JarPathUtil::restartHelperJar)
                        .thenReturn(null);

                ResponseEntity<Map<String, Object>> response = controller.restartApplication();

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                assertThat(response.getBody().get("error").toString())
                        .contains("Restart helper not found");
            }
        }
    }
}
