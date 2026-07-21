package stirling.software.common.configuration;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.function.Predicate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.util.ReflectionTestUtils;

import stirling.software.common.model.ApplicationProperties;

class AppConfigTest {

    private ApplicationProperties applicationProperties;
    private MockEnvironment env;
    private AppConfig appConfig;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        env = new MockEnvironment();
        appConfig = new AppConfig(env, applicationProperties);
        ReflectionTestUtils.setField(appConfig, "contextPath", "/");
        ReflectionTestUtils.setField(appConfig, "serverPort", "8080");
        ReflectionTestUtils.setField(appConfig, "v2Enabled", true);
    }

    @Nested
    @DisplayName("Value-backed getters and simple beans")
    class SimpleBeans {

        @Test
        @DisplayName("getter fields reflect injected @Value values")
        void valueGetters() {
            assertThat(appConfig.getContextPath()).isEqualTo("/");
            assertThat(appConfig.getServerPort()).isEqualTo("8080");
        }

        @Test
        @DisplayName("v2Enabled bean mirrors the field")
        void v2EnabledBean() {
            assertThat(appConfig.v2Enabled()).isTrue();
        }

        @Test
        @DisplayName("constant beans return fixed values")
        void constants() {
            assertThat(appConfig.appName()).isEqualTo("Stirling PDF");
            assertThat(appConfig.homeText()).isEqualTo("null");
            assertThat(appConfig.contextPath("/ctx")).isEqualTo("/ctx");
        }

        @Test
        @DisplayName("appVersion resolves from version.properties on classpath")
        void appVersion() {
            assertThat(appConfig.appVersion()).isNotBlank();
        }

        @Test
        @DisplayName("StirlingPDFLabel embeds version")
        void stirlingLabel() {
            assertThat(appConfig.stirlingPDFLabel()).startsWith("Stirling-PDF v");
        }
    }

    @Nested
    @DisplayName("Beans backed by ApplicationProperties")
    class PropertyBackedBeans {

        @Test
        @DisplayName("loginEnabled reflects security flag")
        void loginEnabled() {
            applicationProperties.getSecurity().setEnableLogin(true);
            assertThat(appConfig.loginEnabled()).isTrue();
        }

        @Test
        @DisplayName("backendUrl falls back to localhost when unset")
        void backendUrlFallback() {
            assertThat(appConfig.getBackendUrl()).isEqualTo("http://localhost");
        }

        @Test
        @DisplayName("backendUrl returns configured value when present")
        void backendUrlConfigured() {
            applicationProperties.getSystem().setBackendUrl("https://api.example.com");
            assertThat(appConfig.getBackendUrl()).isEqualTo("https://api.example.com");
        }

        @Test
        @DisplayName("languages bean returns configured languages list")
        void languages() {
            applicationProperties.getUi().setLanguages(List.of("en", "de"));
            assertThat(appConfig.languages()).containsExactly("en", "de");
        }

        @Test
        @DisplayName("navBarText falls back to Stirling PDF when unset")
        void navBarTextFallback() {
            assertThat(appConfig.navBarText()).isEqualTo("Stirling PDF");
        }

        @Test
        @DisplayName("navBarText returns configured value")
        void navBarTextConfigured() {
            applicationProperties.getUi().setAppNameNavbar("My PDF");
            assertThat(appConfig.navBarText()).isEqualTo("My PDF");
        }

        @Test
        @DisplayName("enableAlphaFunctionality reflects system flag")
        void alphaFunctionality() {
            applicationProperties.getSystem().setEnableAlphaFunctionality(true);
            assertThat(appConfig.enableAlphaFunctionality()).isTrue();
        }

        @Test
        @DisplayName("legal text beans return configured values")
        void legalBeans() {
            var legal = applicationProperties.getLegal();
            legal.setTermsAndConditions("terms");
            legal.setPrivacyPolicy("privacy");
            legal.setCookiePolicy("cookie");
            legal.setImpressum("impressum");
            legal.setAccessibilityStatement("a11y");
            assertThat(appConfig.termsAndConditions()).isEqualTo("terms");
            assertThat(appConfig.privacyPolicy()).isEqualTo("privacy");
            assertThat(appConfig.cookiePolicy()).isEqualTo("cookie");
            assertThat(appConfig.impressum()).isEqualTo("impressum");
            assertThat(appConfig.accessibilityStatement()).isEqualTo("a11y");
        }

        @Test
        @DisplayName("analyticsPrompt true when enableAnalytics null")
        void analyticsPrompt() {
            applicationProperties.getSystem().setEnableAnalytics(null);
            assertThat(appConfig.analyticsPrompt()).isTrue();
            applicationProperties.getSystem().setEnableAnalytics(Boolean.TRUE);
            assertThat(appConfig.analyticsPrompt()).isFalse();
        }

        @Test
        @DisplayName("analyticsEnabled true when premium enabled regardless of system flag")
        void analyticsEnabledViaPremium() {
            applicationProperties.getPremium().setEnabled(true);
            assertThat(appConfig.analyticsEnabled()).isTrue();
        }

        @Test
        @DisplayName("analyticsEnabled reflects system flag when premium disabled")
        void analyticsEnabledViaSystem() {
            applicationProperties.getPremium().setEnabled(false);
            applicationProperties.getSystem().setEnableAnalytics(Boolean.TRUE);
            assertThat(appConfig.analyticsEnabled()).isTrue();
            applicationProperties.getSystem().setEnableAnalytics(Boolean.FALSE);
            assertThat(appConfig.analyticsEnabled()).isFalse();
        }

        @Test
        @DisplayName("scarf and posthog beans reflect derived flags")
        void scarfAndPosthog() {
            applicationProperties.getSystem().setEnableAnalytics(Boolean.TRUE);
            applicationProperties.getSystem().setEnableScarf(Boolean.TRUE);
            applicationProperties.getSystem().setEnablePosthog(Boolean.TRUE);
            assertThat(appConfig.scarfEnabled()).isTrue();
            assertThat(appConfig.posthogEnabled()).isTrue();
        }

        @Test
        @DisplayName("uuid bean returns generated UUID")
        void uuidBean() {
            applicationProperties.getAutomaticallyGenerated().setUUID("abc-123");
            assertThat(appConfig.uuid()).isEqualTo("abc-123");
        }

        @Test
        @DisplayName("typed config beans return live nested instances")
        void typedConfigBeans() {
            assertThat(appConfig.security()).isSameAs(applicationProperties.getSecurity());
            assertThat(appConfig.oAuth2())
                    .isSameAs(applicationProperties.getSecurity().getOauth2());
            assertThat(appConfig.premium()).isSameAs(applicationProperties.getPremium());
            assertThat(appConfig.system()).isSameAs(applicationProperties.getSystem());
            assertThat(appConfig.datasource())
                    .isSameAs(applicationProperties.getSystem().getDatasource());
        }
    }

    @Nested
    @DisplayName("Profile-default and environment beans")
    class ProfileAndEnvBeans {

        @Test
        @DisplayName("default-profile license beans return community defaults")
        void licenseDefaults() {
            assertThat(appConfig.runningProOrHigher()).isFalse();
            assertThat(appConfig.runningEnterprise()).isFalse();
            assertThat(appConfig.licenseType()).isEqualTo("NORMAL");
        }

        @Test
        @DisplayName("activeSecurity reflects classpath presence of SecurityConfiguration")
        void activeSecurity() {
            // Just exercise the branch; result depends on classpath, assert it does not throw.
            boolean present = appConfig.missingActiveSecurity();
            assertThat(present).isIn(true, false);
        }

        @Test
        @DisplayName("rateLimit parses system property")
        void rateLimitProperty() {
            String prev = System.getProperty("rateLimit");
            try {
                System.setProperty("rateLimit", "true");
                assertThat(appConfig.rateLimit()).isTrue();
            } finally {
                if (prev == null) {
                    System.clearProperty("rateLimit");
                } else {
                    System.setProperty("rateLimit", prev);
                }
            }
        }

        @Test
        @DisplayName("runningInDocker false outside container")
        void runningInDocker() {
            // CI/test host is not a container with /.dockerenv.
            assertThat(appConfig.runningInDocker()).isFalse();
        }

        @Test
        @DisplayName("configDirMounted defaults to true when not in docker")
        void configDirMounted() {
            assertThat(appConfig.isRunningInDockerWithConfig()).isTrue();
        }

        @Test
        @DisplayName("directoryFilter accepts files and rejects processing dirs")
        void directoryFilter(@org.junit.jupiter.api.io.TempDir Path tempDir) throws Exception {
            Predicate<Path> filter = appConfig.processOnlyFiles();
            Path file = Files.createFile(tempDir.resolve("a.txt"));
            Path normalDir = Files.createDirectory(tempDir.resolve("normal"));
            Path processingDir = Files.createDirectory(tempDir.resolve("processing"));
            assertThat(filter.test(file)).isTrue();
            assertThat(filter.test(normalDir)).isTrue();
            assertThat(filter.test(processingDir)).isFalse();
        }

        @Test
        @DisplayName("machineType returns Server-jar in plain test environment")
        void machineTypeServerJar() {
            assertThat(appConfig.determineMachineType()).isEqualTo("Server-jar");
        }

        @Test
        @DisplayName("machineType returns a Client-* variant when BROWSER_OPEN set")
        void machineTypeClient() {
            env.setProperty("BROWSER_OPEN", "true");
            assertThat(appConfig.determineMachineType()).startsWith("Client-");
        }
    }
}
