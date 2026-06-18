package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.GeneralUtils;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SettingsControllerTest {

    @Mock private ApplicationProperties applicationProperties;
    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private ApplicationProperties.System system;

    private SettingsController settingsController;

    @BeforeEach
    void setUp() {
        settingsController = new SettingsController(applicationProperties, endpointConfiguration);
    }

    @Nested
    @DisplayName("updateApiKey (update-enable-analytics)")
    class UpdateApiKey {

        @Test
        @DisplayName("persists and returns 200 OK when analytics flag not yet set (null)")
        void updatesWhenNotPreviouslySet() throws Exception {
            when(applicationProperties.getSystem()).thenReturn(system);
            when(system.getEnableAnalytics()).thenReturn(null);

            try (MockedStatic<GeneralUtils> generalUtils = mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> response =
                        settingsController.updateApiKey(Boolean.TRUE);

                assertNotNull(response);
                assertEquals(HttpStatus.OK, response.getStatusCode());
                assertNotNull(response.getBody());
                assertEquals("Updated", response.getBody().get("message"));

                generalUtils.verify(
                        () ->
                                GeneralUtils.saveKeyToSettings(
                                        "system.enableAnalytics", Boolean.TRUE),
                        times(1));
            }

            verify(system).setEnableAnalytics(Boolean.TRUE);
        }

        @Test
        @DisplayName("persists the false value when enabling analytics is declined")
        void updatesWithFalseValue() throws Exception {
            when(applicationProperties.getSystem()).thenReturn(system);
            when(system.getEnableAnalytics()).thenReturn(null);

            try (MockedStatic<GeneralUtils> generalUtils = mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> response =
                        settingsController.updateApiKey(Boolean.FALSE);

                assertEquals(HttpStatus.OK, response.getStatusCode());
                assertEquals("Updated", response.getBody().get("message"));

                generalUtils.verify(
                        () ->
                                GeneralUtils.saveKeyToSettings(
                                        "system.enableAnalytics", Boolean.FALSE),
                        times(1));
            }

            verify(system).setEnableAnalytics(Boolean.FALSE);
        }

        @Test
        @DisplayName("returns 208 ALREADY_REPORTED and does not persist when flag already true")
        void alreadyReportedWhenAlreadyTrue() throws Exception {
            when(applicationProperties.getSystem()).thenReturn(system);
            when(system.getEnableAnalytics()).thenReturn(Boolean.TRUE);

            try (MockedStatic<GeneralUtils> generalUtils = mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> response =
                        settingsController.updateApiKey(Boolean.TRUE);

                assertNotNull(response);
                assertEquals(HttpStatus.ALREADY_REPORTED, response.getStatusCode());
                assertNotNull(response.getBody());

                Object message = response.getBody().get("message");
                assertNotNull(message);
                assertTrue(
                        message.toString().startsWith("Setting has already been set"),
                        "Unexpected message: " + message);

                generalUtils.verify(() -> GeneralUtils.saveKeyToSettings(any(), any()), never());
            }

            verify(system, never()).setEnableAnalytics(any());
        }

        @Test
        @DisplayName("returns 208 ALREADY_REPORTED when flag already false (any non-null is set)")
        void alreadyReportedWhenAlreadyFalse() throws Exception {
            when(applicationProperties.getSystem()).thenReturn(system);
            when(system.getEnableAnalytics()).thenReturn(Boolean.FALSE);

            try (MockedStatic<GeneralUtils> generalUtils = mockStatic(GeneralUtils.class)) {
                ResponseEntity<Map<String, Object>> response =
                        settingsController.updateApiKey(Boolean.TRUE);

                assertEquals(HttpStatus.ALREADY_REPORTED, response.getStatusCode());
                generalUtils.verify(
                        () -> GeneralUtils.saveKeyToSettings(eq("system.enableAnalytics"), any()),
                        never());
            }

            verify(system, never()).setEnableAnalytics(any());
        }
    }

    @Nested
    @DisplayName("getDisabledEndpoints (get-endpoints-status)")
    class GetDisabledEndpoints {

        @Test
        @DisplayName("returns 200 OK with the endpoint status map from EndpointConfiguration")
        void returnsEndpointStatuses() {
            Map<String, Boolean> statuses = new ConcurrentHashMap<>();
            statuses.put("merge-pdfs", Boolean.TRUE);
            statuses.put("remove-blanks", Boolean.FALSE);
            when(endpointConfiguration.getEndpointStatuses()).thenReturn(statuses);

            ResponseEntity<Map<String, Boolean>> response =
                    settingsController.getDisabledEndpoints();

            assertNotNull(response);
            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertSame(statuses, response.getBody());
            assertEquals(Boolean.TRUE, response.getBody().get("merge-pdfs"));
            assertEquals(Boolean.FALSE, response.getBody().get("remove-blanks"));
            verify(endpointConfiguration).getEndpointStatuses();
        }

        @Test
        @DisplayName("returns 200 OK with an empty map when no statuses are configured")
        void returnsEmptyMap() {
            Map<String, Boolean> statuses = new HashMap<>();
            when(endpointConfiguration.getEndpointStatuses()).thenReturn(statuses);

            ResponseEntity<Map<String, Boolean>> response =
                    settingsController.getDisabledEndpoints();

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertNotNull(response.getBody());
            assertTrue(response.getBody().isEmpty());
        }
    }
}
