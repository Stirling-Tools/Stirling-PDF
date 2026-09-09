package stirling.software.common.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.mock.env.MockEnvironment;

import com.posthog.java.PostHog;

import stirling.software.common.model.ApplicationProperties;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class PostHogServiceTest {

    private static final String UUID = "test-uuid-1234";
    private static final String APP_VERSION = "9.9.9";

    @Mock PostHog postHog;
    @Mock UserServiceInterface userService;

    /** Build an ApplicationProperties with analytics/posthog toggled. */
    private ApplicationProperties props(boolean analyticsEnabled) {
        ApplicationProperties appProps = new ApplicationProperties();
        appProps.getSystem().setEnableAnalytics(analyticsEnabled);
        return appProps;
    }

    /** Construct the service under test. */
    private PostHogService newService(
            ApplicationProperties appProps,
            UserServiceInterface user,
            boolean configDirMounted,
            MockEnvironment env) {
        return new PostHogService(
                postHog, UUID, configDirMounted, APP_VERSION, appProps, user, env);
    }

    private MockEnvironment env() {
        return new MockEnvironment();
    }

    @Nested
    @DisplayName("Constructor / captureSystemInfo")
    class ConstructorBehavior {

        @Test
        @DisplayName("constructor captures system_info when posthog is enabled")
        void constructorCapturesWhenEnabled() {
            ApplicationProperties appProps = props(true);

            newService(appProps, userService, false, env());

            verify(postHog).capture(eq(UUID), eq("system_info_captured"), anyMap());
        }

        @Test
        @DisplayName("constructor does not capture when analytics disabled")
        void constructorNoCaptureWhenDisabled() {
            ApplicationProperties appProps = props(false);

            newService(appProps, userService, false, env());

            verify(postHog, never()).capture(anyString(), anyString(), anyMap());
        }

        @Test
        @DisplayName("constructor does not capture when posthog explicitly disabled")
        void constructorNoCaptureWhenPosthogOff() {
            ApplicationProperties appProps = props(true);
            appProps.getSystem().setEnablePosthog(false);

            newService(appProps, userService, false, env());

            verify(postHog, never()).capture(anyString(), anyString(), anyMap());
        }

        @Test
        @DisplayName("constructor swallows exceptions thrown by postHog.capture")
        void constructorSwallowsCaptureException() {
            ApplicationProperties appProps = props(true);
            doThrow(new RuntimeException("boom"))
                    .when(postHog)
                    .capture(anyString(), anyString(), anyMap());

            // Must not propagate; constructor wraps capture in try/catch.
            assertDoesNotThrow(() -> newService(appProps, userService, false, env()));
        }

        @Test
        @DisplayName("constructor works with null userService (optional dependency)")
        void constructorWithNullUserService() {
            ApplicationProperties appProps = props(true);

            assertDoesNotThrow(() -> newService(appProps, null, false, env()));
            verify(postHog).capture(eq(UUID), eq("system_info_captured"), anyMap());
        }
    }

    @Nested
    @DisplayName("captureEvent")
    class CaptureEvent {

        @Test
        @DisplayName("captureEvent forwards to postHog when enabled and injects app_version")
        void captureEventWhenEnabled() {
            ApplicationProperties appProps = props(true);
            PostHogService service = newService(appProps, userService, false, env());
            // Reset the constructor's capture so we only assert on captureEvent.
            clearInvocations(postHog);

            Map<String, Object> properties = new HashMap<>();
            properties.put("foo", "bar");
            service.captureEvent("my_event", properties);

            @SuppressWarnings("unchecked")
            ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
            verify(postHog).capture(eq(UUID), eq("my_event"), captor.capture());
            Map<String, Object> sent = captor.getValue();
            assertEquals("bar", sent.get("foo"));
            assertEquals(APP_VERSION, sent.get("app_version"));
        }

        @Test
        @DisplayName("captureEvent is a no-op when analytics disabled")
        void captureEventWhenDisabled() {
            ApplicationProperties appProps = props(false);
            PostHogService service = newService(appProps, userService, false, env());
            clearInvocations(postHog);

            Map<String, Object> properties = new HashMap<>();
            service.captureEvent("my_event", properties);

            verify(postHog, never()).capture(anyString(), anyString(), anyMap());
            // app_version must not be added when disabled (early return).
            assertFalse(properties.containsKey("app_version"));
        }

        @Test
        @DisplayName("captureEvent adds app_version key to the provided map")
        void captureEventMutatesMap() {
            ApplicationProperties appProps = props(true);
            PostHogService service = newService(appProps, userService, false, env());
            clearInvocations(postHog);

            Map<String, Object> properties = new HashMap<>();
            service.captureEvent("evt", properties);

            assertTrue(properties.containsKey("app_version"));
            assertEquals(APP_VERSION, properties.get("app_version"));
        }
    }

    @Nested
    @DisplayName("captureServerMetrics")
    class CaptureServerMetrics {

        private PostHogService disabledService() {
            // Keep posthog disabled so the constructor performs no capture; metrics
            // methods are independent of the enabled flag.
            return newService(props(false), userService, true, env());
        }

        @Test
        @DisplayName("includes core application and system metrics")
        void includesCoreMetrics() {
            PostHogService service = disabledService();

            Map<String, Object> metrics = service.captureServerMetrics();

            assertEquals(APP_VERSION, metrics.get("app_version"));
            assertEquals(true, metrics.get("mounted_config_dir"));
            assertNotNull(metrics.get("os_name"));
            assertNotNull(metrics.get("java_version"));
            assertTrue(metrics.containsKey("cpu_cores"));
            assertTrue(metrics.containsKey("total_memory"));
            assertTrue(metrics.containsKey("free_memory"));
            assertTrue(metrics.containsKey("process_id"));
            assertTrue(metrics.containsKey("jvm_uptime_ms"));
            assertTrue(metrics.containsKey("thread_count"));
        }

        @Test
        @DisplayName("deployment_type defaults to JAR when not docker/exe")
        void deploymentTypeJar() {
            PostHogService service = disabledService();

            Map<String, Object> metrics = service.captureServerMetrics();

            // In the unit-test environment there is no /.dockerenv and no BROWSER_OPEN.
            assertEquals("JAR", metrics.get("deployment_type"));
        }

        @Test
        @DisplayName("deployment_type becomes EXE when BROWSER_OPEN=true")
        void deploymentTypeExe() {
            MockEnvironment environment = env();
            environment.setProperty("BROWSER_OPEN", "true");
            PostHogService service = newService(props(false), userService, false, environment);

            Map<String, Object> metrics = service.captureServerMetrics();

            assertEquals("EXE", metrics.get("deployment_type"));
        }

        @Test
        @DisplayName("BROWSER_OPEN matching is case-insensitive")
        void deploymentTypeExeCaseInsensitive() {
            MockEnvironment environment = env();
            environment.setProperty("BROWSER_OPEN", "TRUE");
            PostHogService service = newService(props(false), userService, false, environment);

            Map<String, Object> metrics = service.captureServerMetrics();

            assertEquals("EXE", metrics.get("deployment_type"));
        }

        @Test
        @DisplayName("mounted_config_dir reflects the configDirMounted flag")
        void mountedConfigDirFalse() {
            PostHogService service = newService(props(false), userService, false, env());

            Map<String, Object> metrics = service.captureServerMetrics();

            assertEquals(false, metrics.get("mounted_config_dir"));
        }

        @Test
        @DisplayName("includes total_users_created when userService present")
        void includesUserCountWhenUserServicePresent() {
            when(userService.getTotalUsersCount()).thenReturn(42L);
            PostHogService service = newService(props(false), userService, false, env());

            Map<String, Object> metrics = service.captureServerMetrics();

            assertEquals(42L, metrics.get("total_users_created"));
        }

        @Test
        @DisplayName("omits total_users_created when userService is null")
        void omitsUserCountWhenUserServiceNull() {
            PostHogService service = newService(props(false), null, false, env());

            Map<String, Object> metrics = service.captureServerMetrics();

            assertFalse(metrics.containsKey("total_users_created"));
        }

        @Test
        @DisplayName("always embeds nested application_properties map")
        void embedsApplicationProperties() {
            PostHogService service = disabledService();

            Map<String, Object> metrics = service.captureServerMetrics();

            assertTrue(metrics.get("application_properties") instanceof Map);
        }
    }

    @Nested
    @DisplayName("captureApplicationProperties")
    class CaptureApplicationProperties {

        private PostHogService serviceWith(ApplicationProperties appProps) {
            // Disable analytics to keep the constructor from capturing.
            appProps.getSystem().setEnableAnalytics(false);
            return newService(appProps, userService, false, env());
        }

        @Test
        @DisplayName("includes blank-trimmed legal strings only when non-empty")
        void legalPropertiesFiltered() {
            ApplicationProperties appProps = new ApplicationProperties();
            appProps.getLegal().setTermsAndConditions("  https://terms  ");
            appProps.getLegal().setPrivacyPolicy(""); // blank -> skipped
            PostHogService service = serviceWith(appProps);

            Map<String, Object> p = service.captureApplicationProperties();

            // String values are trimmed by addIfNotEmpty.
            assertEquals("https://terms", p.get("legal_termsAndConditions"));
            assertFalse(p.containsKey("legal_privacyPolicy"));
            assertFalse(p.containsKey("legal_accessibilityStatement"));
        }

        @Test
        @DisplayName("always reports csrfDisabled true and login booleans")
        void securityProperties() {
            ApplicationProperties appProps = new ApplicationProperties();
            appProps.getSecurity().setEnableLogin(true);
            appProps.getSecurity().setLoginAttemptCount(5);
            appProps.getSecurity().setLoginResetTimeMinutes(10);
            PostHogService service = serviceWith(appProps);

            Map<String, Object> p = service.captureApplicationProperties();

            assertEquals(true, p.get("security_csrfDisabled"));
            assertEquals(true, p.get("security_enableLogin"));
            assertEquals(5, p.get("security_loginAttemptCount"));
            assertEquals(10L, p.get("security_loginResetTimeMinutes"));
            assertEquals("all", p.get("security_loginMethod"));
        }

        @Test
        @DisplayName("oauth2 nested fields are omitted when oauth2 disabled")
        void oauth2DisabledOmitsNested() {
            ApplicationProperties appProps = new ApplicationProperties();
            // oauth2.enabled defaults to false.
            PostHogService service = serviceWith(appProps);

            Map<String, Object> p = service.captureApplicationProperties();

            assertEquals(false, p.get("security_oauth2_enabled"));
            assertFalse(p.containsKey("security_oauth2_autoCreateUser"));
            assertFalse(p.containsKey("security_oauth2_provider"));
        }

        @Test
        @DisplayName("oauth2 nested fields are included when oauth2 enabled")
        void oauth2EnabledIncludesNested() {
            ApplicationProperties appProps = new ApplicationProperties();
            appProps.getSecurity().getOauth2().setEnabled(true);
            appProps.getSecurity().getOauth2().setAutoCreateUser(true);
            appProps.getSecurity().getOauth2().setBlockRegistration(false);
            appProps.getSecurity().getOauth2().setUseAsUsername("email");
            appProps.getSecurity().getOauth2().setProvider("google");
            PostHogService service = serviceWith(appProps);

            Map<String, Object> p = service.captureApplicationProperties();

            assertEquals(true, p.get("security_oauth2_enabled"));
            assertEquals(true, p.get("security_oauth2_autoCreateUser"));
            assertEquals(false, p.get("security_oauth2_blockRegistration"));
            assertEquals("email", p.get("security_oauth2_useAsUsername"));
            assertEquals("google", p.get("security_oauth2_provider"));
        }

        @Test
        @DisplayName("system analytics/posthog/scarf booleans are reported")
        void systemAnalyticsBooleans() {
            ApplicationProperties appProps = new ApplicationProperties();
            appProps.getSystem().setEnableAnalytics(true);
            appProps.getSystem().setEnablePosthog(true);
            appProps.getSystem().setEnableScarf(false);
            appProps.getSystem().setDefaultLocale("en-US");
            PostHogService service = newService(appProps, userService, false, env());
            // Constructor will capture once because analytics is enabled; that's fine.
            clearInvocations(postHog);

            Map<String, Object> p = service.captureApplicationProperties();

            assertEquals("en-US", p.get("system_defaultLocale"));
            assertEquals(true, p.get("system_enableAnalytics"));
            assertEquals(true, p.get("system_enablePosthog"));
            // isScarfEnabled() is false because enableScarf is false.
            assertEquals(false, p.get("system_enableScarf"));
        }

        @Test
        @DisplayName("metrics_enabled and autoPipeline output folder included appropriately")
        void metricsAndAutoPipeline() {
            ApplicationProperties appProps = new ApplicationProperties();
            appProps.getMetrics().setEnabled(true);
            appProps.getAutoPipeline().setOutputFolder("/tmp/out");
            PostHogService service = serviceWith(appProps);

            Map<String, Object> p = service.captureApplicationProperties();

            assertEquals(true, p.get("metrics_enabled"));
            assertEquals("/tmp/out", p.get("autoPipeline_outputFolder"));
        }

        @Test
        @DisplayName("enterprise metadata flag omitted when premium disabled")
        void premiumDisabledOmitsMetadata() {
            ApplicationProperties appProps = new ApplicationProperties();
            // premium.enabled defaults to false.
            PostHogService service = serviceWith(appProps);

            Map<String, Object> p = service.captureApplicationProperties();

            assertEquals(false, p.get("enterpriseEdition_enabled"));
            assertFalse(p.containsKey("enterpriseEdition_customMetadata_autoUpdateMetadata"));
        }

        @Test
        @DisplayName("enterprise metadata flag included when premium enabled")
        void premiumEnabledIncludesMetadata() {
            ApplicationProperties appProps = new ApplicationProperties();
            appProps.getPremium().setEnabled(true);
            appProps.getPremium().getProFeatures().getCustomMetadata().setAutoUpdateMetadata(true);
            PostHogService service = serviceWith(appProps);

            Map<String, Object> p = service.captureApplicationProperties();

            assertEquals(true, p.get("enterpriseEdition_enabled"));
            assertEquals(true, p.get("enterpriseEdition_customMetadata_autoUpdateMetadata"));
        }

        @Test
        @DisplayName("ui appNameNavbar omitted when blank, included when set")
        void uiAppNameNavbar() {
            ApplicationProperties blankProps = new ApplicationProperties();
            // appNameNavbar getter returns null for blank/empty values.
            PostHogService blankService = serviceWith(blankProps);
            Map<String, Object> blank = blankService.captureApplicationProperties();
            assertFalse(blank.containsKey("ui_appNameNavbar"));

            ApplicationProperties namedProps = new ApplicationProperties();
            namedProps.getUi().setAppNameNavbar("My App");
            PostHogService namedService = serviceWith(namedProps);
            Map<String, Object> named = namedService.captureApplicationProperties();
            assertEquals("My App", named.get("ui_appNameNavbar"));
        }

        @Test
        @DisplayName("returns a non-null map for a fresh ApplicationProperties")
        void defaultsProduceNonNullMap() {
            PostHogService service = serviceWith(new ApplicationProperties());

            Map<String, Object> p = service.captureApplicationProperties();

            assertNotNull(p);
            // csrfDisabled is always added regardless of config, so map is never empty.
            assertTrue(p.containsKey("security_csrfDisabled"));
        }
    }
}
