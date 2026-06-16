package stirling.software.proprietary.security.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;

import java.io.IOException;
import java.lang.reflect.Field;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
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
@MockitoSettings(strictness = Strictness.LENIENT)
class AdminSettingsControllerTest {

    // Real Jackson mapper so convertValue against ApplicationProperties behaves like production.
    private final ObjectMapper objectMapper = JsonMapper.builder().build();

    @Mock private ApplicationContext applicationContext;

    private ApplicationProperties applicationProperties;
    private AdminSettingsController controller;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        controller =
                new AdminSettingsController(
                        applicationProperties, objectMapper, applicationContext);
        clearPendingChanges();
    }

    @AfterEach
    void tearDown() {
        clearPendingChanges();
    }

    // pendingChanges is a private static ConcurrentHashMap shared across instances; reset it
    // between tests so state never leaks. There is no public reset hook on the controller.
    @SuppressWarnings("unchecked")
    private static ConcurrentHashMap<String, Object> pendingChanges() {
        try {
            Field field = AdminSettingsController.class.getDeclaredField("pendingChanges");
            field.setAccessible(true);
            return (ConcurrentHashMap<String, Object>) field.get(null);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void clearPendingChanges() {
        pendingChanges().clear();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> asMap(Object body) {
        return (Map<String, Object>) body;
    }

    // ------------------------------------------------------------------
    // getSettings
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("getSettings")
    class GetSettings {

        @Test
        @DisplayName("returns 200 and a settings map containing known sections")
        void returnsAllSettings() {
            ResponseEntity<?> response = controller.getSettings(false);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            Map<String, Object> body = asMap(response.getBody());
            assertThat(body).isNotNull();
            // ApplicationProperties exposes these top-level sections.
            assertThat(body).containsKeys("security", "system", "ui", "premium");
        }

        @Test
        @DisplayName("masks sensitive nested fields even when no pending changes exist")
        void masksSensitiveFields() {
            applicationProperties.getSecurity().getOauth2().setClientSecret("super-secret");

            ResponseEntity<?> response = controller.getSettings(false);

            Map<String, Object> body = asMap(response.getBody());
            Map<String, Object> security = asMap(body.get("security"));
            Map<String, Object> oauth2 = asMap(security.get("oauth2"));
            assertThat(oauth2.get("clientSecret")).isEqualTo("********");
        }

        @Test
        @DisplayName("does NOT mask premium.key (explicitly excluded from masking)")
        void doesNotMaskPremiumKey() {
            applicationProperties.getPremium().setKey("LICENSE-1234");

            ResponseEntity<?> response = controller.getSettings(false);

            Map<String, Object> body = asMap(response.getBody());
            Map<String, Object> premium = asMap(body.get("premium"));
            assertThat(premium.get("key")).isEqualTo("LICENSE-1234");
        }

        @Test
        @DisplayName("merges pending changes when includePending=true")
        void mergesPendingChangesWhenRequested() {
            pendingChanges().put("ui.appName", "Pending Name");

            ResponseEntity<?> response = controller.getSettings(true);

            Map<String, Object> body = asMap(response.getBody());
            Map<String, Object> ui = asMap(body.get("ui"));
            assertThat(ui.get("appName")).isEqualTo("Pending Name");
        }

        @Test
        @DisplayName("ignores pending changes when includePending=false")
        void ignoresPendingChangesWhenNotRequested() {
            pendingChanges().put("ui.appName", "Pending Name");

            ResponseEntity<?> response = controller.getSettings(false);

            Map<String, Object> body = asMap(response.getBody());
            Map<String, Object> ui = asMap(body.get("ui"));
            assertThat(ui.get("appName")).isNotEqualTo("Pending Name");
        }
    }

    // ------------------------------------------------------------------
    // getSettingsDelta
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("getSettingsDelta")
    class GetSettingsDelta {

        @Test
        @DisplayName("reports no pending changes when map is empty")
        void emptyDelta() {
            ResponseEntity<?> response = controller.getSettingsDelta();

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            Map<String, Object> body = asMap(response.getBody());
            assertThat(body.get("hasPendingChanges")).isEqualTo(false);
            assertThat(body.get("count")).isEqualTo(0);
            assertThat(asMap(body.get("pendingChanges"))).isEmpty();
        }

        @Test
        @DisplayName("reports pending changes and masks sensitive keys")
        void reportsPendingChanges() {
            pendingChanges().put("ui.appName", "New App");
            pendingChanges().put("security.oauth2.clientSecret", "shh");

            ResponseEntity<?> response = controller.getSettingsDelta();

            Map<String, Object> body = asMap(response.getBody());
            assertThat(body.get("hasPendingChanges")).isEqualTo(true);
            assertThat(body.get("count")).isEqualTo(2);

            Map<String, Object> masked = asMap(body.get("pendingChanges"));
            assertThat(masked.get("ui.appName")).isEqualTo("New App");
            // The flat key "security.oauth2.clientSecret" ends in a sensitive field name.
            assertThat(masked.get("security.oauth2.clientSecret")).isEqualTo("********");
        }
    }

    // ------------------------------------------------------------------
    // updateSettings (PUT)
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("updateSettings")
    class UpdateSettings {

        @Test
        @DisplayName("returns 400 when no settings provided (null map)")
        void rejectsNullSettings() {
            UpdateSettingsRequest request = new UpdateSettingsRequest();
            request.setSettings(null);

            ResponseEntity<Map<String, Object>> response = controller.updateSettings(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody().get("error")).isEqualTo("No settings provided to update");
        }

        @Test
        @DisplayName("returns 400 when settings map is empty")
        void rejectsEmptySettings() {
            UpdateSettingsRequest request = new UpdateSettingsRequest();
            request.setSettings(new HashMap<>());

            ResponseEntity<Map<String, Object>> response = controller.updateSettings(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody().get("error")).isEqualTo("No settings provided to update");
        }

        @Test
        @DisplayName("returns 400 for an invalid key format and does not persist")
        void rejectsInvalidKeyFormat() {
            Map<String, Object> settings = new HashMap<>();
            settings.put("security.foo bar", "x"); // space is illegal per SAFE_KEY_PATTERN
            UpdateSettingsRequest request = new UpdateSettingsRequest();
            request.setSettings(settings);

            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> response = controller.updateSettings(request);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                assertThat((String) response.getBody().get("error"))
                        .startsWith("Invalid setting key format");
                gu.verify(() -> GeneralUtils.updateSettingsTransactional(any()), never());
            }
            assertThat(pendingChanges()).isEmpty();
        }

        @Test
        @DisplayName("returns 400 when the first key part is not a valid section name")
        void rejectsUnknownSection() {
            Map<String, Object> settings = new HashMap<>();
            settings.put("notARealSection.value", "x");
            UpdateSettingsRequest request = new UpdateSettingsRequest();
            request.setSettings(settings);

            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> response = controller.updateSettings(request);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                gu.verify(() -> GeneralUtils.updateSettingsTransactional(any()), never());
            }
        }

        @Test
        @DisplayName("persists valid settings, tracks them as pending and returns 200")
        void appliesValidSettings() {
            Map<String, Object> settings = new HashMap<>();
            settings.put("ui.appName", "My PDF Tool");
            settings.put("system.enableAnalytics", false);
            UpdateSettingsRequest request = new UpdateSettingsRequest();
            request.setSettings(settings);

            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> response = controller.updateSettings(request);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                assertThat((String) response.getBody().get("message"))
                        .contains("Successfully updated 2 setting(s)");
                gu.verify(() -> GeneralUtils.updateSettingsTransactional(settings), times(1));
            }

            assertThat(pendingChanges()).containsEntry("ui.appName", "My PDF Tool");
            assertThat(pendingChanges()).containsEntry("system.enableAnalytics", false);
        }

        @Test
        @DisplayName("stores empty string for a null value (pending tracking never holds null)")
        void nullValueTrackedAsEmptyString() {
            Map<String, Object> settings = new HashMap<>();
            settings.put("ui.appName", null);
            UpdateSettingsRequest request = new UpdateSettingsRequest();
            request.setSettings(settings);

            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> response = controller.updateSettings(request);
                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            }

            assertThat(pendingChanges()).containsEntry("ui.appName", "");
        }

        @Test
        @DisplayName("returns 500 with generic file error when persistence throws IOException")
        void ioExceptionYields500() {
            Map<String, Object> settings = new HashMap<>();
            settings.put("ui.appName", "X");
            UpdateSettingsRequest request = new UpdateSettingsRequest();
            request.setSettings(settings);

            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                gu.when(() -> GeneralUtils.updateSettingsTransactional(any()))
                        .thenThrow(new IOException("disk full"));

                ResponseEntity<Map<String, Object>> response = controller.updateSettings(request);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
                assertThat(response.getBody().get("error"))
                        .isEqualTo("Failed to save settings to configuration file.");
            }
            // Nothing should have been tracked as pending after a failed save.
            assertThat(pendingChanges()).isEmpty();
        }

        @Test
        @DisplayName("returns 400 generic message when persistence throws IllegalArgumentException")
        void illegalArgumentYields400() {
            Map<String, Object> settings = new HashMap<>();
            settings.put("ui.appName", "X");
            UpdateSettingsRequest request = new UpdateSettingsRequest();
            request.setSettings(settings);

            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                gu.when(() -> GeneralUtils.updateSettingsTransactional(any()))
                        .thenThrow(new IllegalArgumentException("bad"));

                ResponseEntity<Map<String, Object>> response = controller.updateSettings(request);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                assertThat(response.getBody().get("error"))
                        .isEqualTo("Invalid setting key or value.");
            }
        }

        @Test
        @DisplayName("returns 500 generic server error for an unexpected runtime exception")
        void unexpectedExceptionYields500() {
            Map<String, Object> settings = new HashMap<>();
            settings.put("ui.appName", "X");
            UpdateSettingsRequest request = new UpdateSettingsRequest();
            request.setSettings(settings);

            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                gu.when(() -> GeneralUtils.updateSettingsTransactional(any()))
                        .thenThrow(new RuntimeException("boom"));

                ResponseEntity<Map<String, Object>> response = controller.updateSettings(request);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
                assertThat(response.getBody().get("error"))
                        .isEqualTo("Internal server error occurred.");
            }
        }

        @Test
        @DisplayName("accepts empty watched-folders path list (uses default, no error)")
        void acceptsEmptyWatchedFolderList() {
            Map<String, Object> settings = new HashMap<>();
            settings.put("system.customPaths.pipeline.watchedFoldersDirs", new ArrayList<String>());
            UpdateSettingsRequest request = new UpdateSettingsRequest();
            request.setSettings(settings);

            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> response = controller.updateSettings(request);
                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            }
        }

        @Test
        @DisplayName("rejects duplicate watched-folders paths")
        void rejectsDuplicateWatchedFolderPaths() {
            List<String> paths = new ArrayList<>();
            paths.add("folderA");
            paths.add("folderA");
            Map<String, Object> settings = new HashMap<>();
            settings.put("system.customPaths.pipeline.watchedFoldersDirs", paths);
            UpdateSettingsRequest request = new UpdateSettingsRequest();
            request.setSettings(settings);

            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> response = controller.updateSettings(request);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                assertThat((String) response.getBody().get("error"))
                        .contains("Duplicate path detected");
                gu.verify(() -> GeneralUtils.updateSettingsTransactional(any()), never());
            }
        }

        @Test
        @DisplayName("rejects overlapping watched-folders paths")
        void rejectsOverlappingWatchedFolderPaths() {
            List<String> paths = new ArrayList<>();
            paths.add("parent");
            paths.add("parent/child");
            Map<String, Object> settings = new HashMap<>();
            settings.put("system.customPaths.pipeline.watchedFoldersDirs", paths);
            UpdateSettingsRequest request = new UpdateSettingsRequest();
            request.setSettings(settings);

            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> response = controller.updateSettings(request);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                assertThat((String) response.getBody().get("error"))
                        .contains("Overlapping paths detected");
                gu.verify(() -> GeneralUtils.updateSettingsTransactional(any()), never());
            }
        }
    }

    // ------------------------------------------------------------------
    // getSettingsSection (GET /section/{name})
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("getSettingsSection")
    class GetSettingsSection {

        @Test
        @DisplayName("returns 200 with the section map for a valid section")
        void returnsValidSection() {
            ResponseEntity<?> response = controller.getSettingsSection("ui", false);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            Map<String, Object> body = asMap(response.getBody());
            assertThat(body).isNotNull();
            // The ui section should not contain the "_pending" marker when there are no pending.
            assertThat(body).doesNotContainKey("_pending");
        }

        @Test
        @DisplayName("section name lookup is case-insensitive")
        void sectionNameCaseInsensitive() {
            ResponseEntity<?> response = controller.getSettingsSection("SECURITY", false);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        }

        @Test
        @DisplayName("returns 400 for an unknown section name")
        void rejectsUnknownSection() {
            ResponseEntity<?> response = controller.getSettingsSection("nope", false);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat((String) response.getBody()).startsWith("Invalid section name");
        }

        @Test
        @DisplayName("returns 400 for a blank section name")
        void rejectsBlankSection() {
            ResponseEntity<?> response = controller.getSettingsSection("   ", false);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        @DisplayName("adds a _pending block when includePending=true and changes exist")
        void includesPendingBlock() {
            pendingChanges().put("ui.appName", "Pending UI Name");

            ResponseEntity<?> response = controller.getSettingsSection("ui", true);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            Map<String, Object> body = asMap(response.getBody());
            assertThat(body).containsKey("_pending");
            Map<String, Object> pending = asMap(body.get("_pending"));
            assertThat(pending.get("appName")).isEqualTo("Pending UI Name");
        }

        @Test
        @DisplayName("does not add a _pending block when changes belong to other sections")
        void noPendingBlockForUnrelatedSection() {
            pendingChanges().put("security.enableLogin", true);

            ResponseEntity<?> response = controller.getSettingsSection("ui", true);

            Map<String, Object> body = asMap(response.getBody());
            assertThat(body).doesNotContainKey("_pending");
        }

        @Test
        @DisplayName("masks sensitive fields in the returned section map")
        void masksSensitiveSectionFields() {
            applicationProperties.getSecurity().getOauth2().setClientSecret("hidden");

            ResponseEntity<?> response = controller.getSettingsSection("security", false);

            Map<String, Object> body = asMap(response.getBody());
            Map<String, Object> oauth2 = asMap(body.get("oauth2"));
            assertThat(oauth2.get("clientSecret")).isEqualTo("********");
        }
    }

    // ------------------------------------------------------------------
    // updateSettingsSection (PUT /section/{name})
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("updateSettingsSection")
    class UpdateSettingsSection {

        @Test
        @DisplayName("returns 400 when section data is null")
        void rejectsNullData() {
            ResponseEntity<Map<String, Object>> response =
                    controller.updateSettingsSection("ui", null);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody().get("error"))
                    .isEqualTo("No section data provided to update");
        }

        @Test
        @DisplayName("returns 400 when section data is empty")
        void rejectsEmptyData() {
            ResponseEntity<Map<String, Object>> response =
                    controller.updateSettingsSection("ui", new HashMap<>());

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(response.getBody().get("error"))
                    .isEqualTo("No section data provided to update");
        }

        @Test
        @DisplayName("returns 400 for an invalid section name")
        void rejectsInvalidSectionName() {
            Map<String, Object> data = new HashMap<>();
            data.put("appName", "X");

            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> response =
                        controller.updateSettingsSection("madeup", data);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                assertThat((String) response.getBody().get("error"))
                        .startsWith("Invalid section name");
                gu.verify(() -> GeneralUtils.saveKeyToSettings(anyString(), any()), never());
            }
        }

        @Test
        @DisplayName("persists each property, tracks pending and returns 200")
        void appliesSectionUpdates() {
            Map<String, Object> data = new HashMap<>();
            data.put("appName", "Renamed");

            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> response =
                        controller.updateSettingsSection("ui", data);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                assertThat((String) response.getBody().get("message"))
                        .contains("Successfully updated 1 setting(s) in section");
                gu.verify(() -> GeneralUtils.saveKeyToSettings("ui.appName", "Renamed"), times(1));
            }

            assertThat(pendingChanges()).containsEntry("ui.appName", "Renamed");
        }

        @Test
        @DisplayName("auto-enables premium when a non-empty license key is supplied")
        void autoEnablesPremiumWithKey() {
            Map<String, Object> data = new HashMap<>();
            data.put("key", "LICENSE-XYZ");

            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> response =
                        controller.updateSettingsSection("premium", data);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                // Auto-enable adds an "enabled=true" entry that is also persisted.
                gu.verify(() -> GeneralUtils.saveKeyToSettings("premium.key", "LICENSE-XYZ"));
                gu.verify(() -> GeneralUtils.saveKeyToSettings("premium.enabled", true));
            }

            assertThat(pendingChanges()).containsEntry("premium.enabled", true);
        }

        @Test
        @DisplayName("does NOT auto-enable premium when the key is blank")
        void doesNotAutoEnablePremiumWithBlankKey() {
            Map<String, Object> data = new HashMap<>();
            data.put("key", "   ");

            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> response =
                        controller.updateSettingsSection("premium", data);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                gu.verify(() -> GeneralUtils.saveKeyToSettings("premium.enabled", true), never());
            }

            assertThat(pendingChanges()).doesNotContainKey("premium.enabled");
        }

        @Test
        @DisplayName("returns 500 with generic file error when persistence throws IOException")
        void ioExceptionYields500() {
            Map<String, Object> data = new HashMap<>();
            data.put("appName", "X");

            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                gu.when(() -> GeneralUtils.saveKeyToSettings(anyString(), any()))
                        .thenThrow(new IOException("io"));

                ResponseEntity<Map<String, Object>> response =
                        controller.updateSettingsSection("ui", data);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
                assertThat(response.getBody().get("error"))
                        .isEqualTo("Failed to save settings to configuration file.");
            }
        }

        @Test
        @DisplayName("returns 400 generic section error when persistence throws IllegalArgument")
        void illegalArgumentYields400() {
            Map<String, Object> data = new HashMap<>();
            data.put("appName", "X");

            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                gu.when(() -> GeneralUtils.saveKeyToSettings(anyString(), any()))
                        .thenThrow(new IllegalArgumentException("bad"));

                ResponseEntity<Map<String, Object>> response =
                        controller.updateSettingsSection("ui", data);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                assertThat(response.getBody().get("error"))
                        .isEqualTo("Invalid section data provided.");
            }
        }

        @Test
        @DisplayName("returns 500 generic server error for an unexpected runtime exception")
        void unexpectedExceptionYields500() {
            Map<String, Object> data = new HashMap<>();
            data.put("appName", "X");

            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                gu.when(() -> GeneralUtils.saveKeyToSettings(anyString(), any()))
                        .thenThrow(new RuntimeException("boom"));

                ResponseEntity<Map<String, Object>> response =
                        controller.updateSettingsSection("ui", data);

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
                assertThat(response.getBody().get("error"))
                        .isEqualTo("Internal server error occurred.");
            }
        }
    }

    // ------------------------------------------------------------------
    // getSettingValue (GET /key/{key})
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("getSettingValue")
    class GetSettingValue {

        @Test
        @DisplayName("returns 400 for an invalid key format")
        void rejectsInvalidKeyFormat() {
            ResponseEntity<?> response = controller.getSettingValue("ui.app name");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat((String) response.getBody()).startsWith("Invalid setting key format");
        }

        @Test
        @DisplayName("returns 400 when the section is unknown")
        void rejectsUnknownSection() {
            ResponseEntity<?> response = controller.getSettingValue("madeup.value");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        }

        @Test
        @DisplayName("returns 400 when the key resolves to no value")
        void rejectsMissingValue() {
            // premium.key defaults to null -> getSettingByKey returns null -> 400 not found
            ResponseEntity<?> response = controller.getSettingValue("premium.nonExistentField");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat((String) response.getBody()).startsWith("Setting key not found");
        }

        @Test
        @DisplayName("returns the value wrapped in SettingValueResponse for a present key")
        void returnsPresentValue() {
            applicationProperties.getUi().setAppNameNavbar("Stirling");

            ResponseEntity<?> response = controller.getSettingValue("ui.appNameNavbar");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isInstanceOf(SettingValueResponse.class);
            SettingValueResponse body = (SettingValueResponse) response.getBody();
            assertThat(body.getKey()).isEqualTo("ui.appNameNavbar");
            assertThat(body.getValue()).isEqualTo("Stirling");
        }

        @Test
        @DisplayName("masks a sensitive value before returning it")
        void masksSensitiveValue() {
            applicationProperties.getSecurity().getOauth2().setClientSecret("topsecret");

            ResponseEntity<?> response = controller.getSettingValue("security.oauth2.clientSecret");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            SettingValueResponse body = (SettingValueResponse) response.getBody();
            assertThat(body.getValue()).isEqualTo("********");
        }

        @Test
        @DisplayName("does NOT mask premium.key when present")
        void doesNotMaskPremiumKey() {
            applicationProperties.getPremium().setKey("REALKEY");

            ResponseEntity<?> response = controller.getSettingValue("premium.key");

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            SettingValueResponse body = (SettingValueResponse) response.getBody();
            assertThat(body.getValue()).isEqualTo("REALKEY");
        }
    }

    // ------------------------------------------------------------------
    // updateSettingValue (PUT /key/{key})
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("updateSettingValue")
    class UpdateSettingValue {

        private UpdateSettingValueRequest req(Object value) {
            UpdateSettingValueRequest request = new UpdateSettingValueRequest();
            request.setValue(value);
            return request;
        }

        @Test
        @DisplayName("returns 400 for an invalid key format and does not persist")
        void rejectsInvalidKeyFormat() {
            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                ResponseEntity<String> response =
                        controller.updateSettingValue("ui.app name", req("x"));

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                assertThat(response.getBody()).startsWith("Invalid setting key format");
                gu.verify(() -> GeneralUtils.saveKeyToSettings(anyString(), any()), never());
            }
        }

        @Test
        @DisplayName("blocks saving a masked value for a sensitive field")
        void blocksMaskedSensitiveValue() {
            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                ResponseEntity<String> response =
                        controller.updateSettingValue(
                                "security.oauth2.clientSecret", req("********"));

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                assertThat(response.getBody())
                        .contains("Cannot save masked values for sensitive settings");
                gu.verify(() -> GeneralUtils.saveKeyToSettings(anyString(), any()), never());
            }
        }

        @Test
        @DisplayName("allows saving the masked sentinel for a NON-sensitive field")
        void allowsMaskedSentinelForNonSensitiveField() {
            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                ResponseEntity<String> response =
                        controller.updateSettingValue("ui.appName", req("********"));

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                gu.verify(() -> GeneralUtils.saveKeyToSettings("ui.appName", "********"));
            }
            assertThat(pendingChanges()).containsEntry("ui.appName", "********");
        }

        @Test
        @DisplayName("persists a valid value, tracks pending and returns 200")
        void appliesValidValue() {
            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                ResponseEntity<String> response =
                        controller.updateSettingValue("ui.appName", req("Hello"));

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
                assertThat(response.getBody()).contains("Successfully updated setting");
                gu.verify(() -> GeneralUtils.saveKeyToSettings("ui.appName", "Hello"));
            }
            assertThat(pendingChanges()).containsEntry("ui.appName", "Hello");
        }

        @Test
        @DisplayName("returns 500 generic file error when persistence throws IOException")
        void ioExceptionYields500() {
            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                gu.when(() -> GeneralUtils.saveKeyToSettings(anyString(), any()))
                        .thenThrow(new IOException("io"));

                ResponseEntity<String> response =
                        controller.updateSettingValue("ui.appName", req("Hello"));

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
                assertThat(response.getBody())
                        .isEqualTo("Failed to save settings to configuration file.");
            }
        }

        @Test
        @DisplayName("returns 400 generic message when persistence throws IllegalArgument")
        void illegalArgumentYields400() {
            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                gu.when(() -> GeneralUtils.saveKeyToSettings(anyString(), any()))
                        .thenThrow(new IllegalArgumentException("bad"));

                ResponseEntity<String> response =
                        controller.updateSettingValue("ui.appName", req("Hello"));

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                assertThat(response.getBody()).isEqualTo("Invalid setting key or value.");
            }
        }

        @Test
        @DisplayName("returns 500 generic server error for an unexpected runtime exception")
        void unexpectedExceptionYields500() {
            try (MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                gu.when(() -> GeneralUtils.saveKeyToSettings(anyString(), any()))
                        .thenThrow(new RuntimeException("boom"));

                ResponseEntity<String> response =
                        controller.updateSettingValue("ui.appName", req("Hello"));

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
                assertThat(response.getBody()).isEqualTo("Internal server error occurred.");
            }
        }
    }

    // ------------------------------------------------------------------
    // restartApplication (POST /restart) - only the safe dev-mode branch
    // ------------------------------------------------------------------

    @Nested
    @DisplayName("restartApplication")
    class RestartApplication {

        @Test
        @DisplayName("returns 503 in development mode when no JAR is detected")
        void returns503InDevMode() {
            try (MockedStatic<stirling.software.common.util.JarPathUtil> jar =
                    Mockito.mockStatic(stirling.software.common.util.JarPathUtil.class)) {
                jar.when(stirling.software.common.util.JarPathUtil::currentJar).thenReturn(null);

                ResponseEntity<Map<String, Object>> response = controller.restartApplication();

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                assertThat((String) response.getBody().get("error"))
                        .contains("Restart not available in development mode");
            }
        }

        @Test
        @DisplayName("returns 503 when the restart helper jar is missing")
        void returns503WhenHelperMissing() {
            Path fakeAppJar = Path.of("nonexistent-app.jar");
            Path missingHelper = Path.of("nonexistent-restart-helper.jar");

            try (MockedStatic<stirling.software.common.util.JarPathUtil> jar =
                    Mockito.mockStatic(stirling.software.common.util.JarPathUtil.class)) {
                jar.when(stirling.software.common.util.JarPathUtil::currentJar)
                        .thenReturn(fakeAppJar);
                jar.when(stirling.software.common.util.JarPathUtil::restartHelperJar)
                        .thenReturn(missingHelper);

                ResponseEntity<Map<String, Object>> response = controller.restartApplication();

                assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
                assertThat((String) response.getBody().get("error"))
                        .contains("Restart helper not found");
            }
        }
    }
}
