package stirling.software.SPDF;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.lang.reflect.Method;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.env.Environment;

import stirling.software.common.configuration.AppConfig;
import stirling.software.common.model.ApplicationProperties;

/**
 * Remaining static-helper and lifecycle coverage for {@link SPDFApplication} that the existing
 * {@code SPDFApplicationMoreTest} does not reach: profile selection, classpath probing, the
 * setServerPortStatic auto/explicit branches and the non-Tauri init path.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("SPDFApplication remaining coverage")
class SPDFApplicationExtraTest {

    @Mock private AppConfig appConfig;
    @Mock private Environment env;
    @Mock private ApplicationProperties applicationProperties;

    private static Object invokeStatic(String name, Class<?>[] sig, Object... args)
            throws Exception {
        Method m = SPDFApplication.class.getDeclaredMethod(name, sig);
        m.setAccessible(true);
        return m.invoke(null, args);
    }

    @Nested
    @DisplayName("getActiveProfile")
    class GetActiveProfile {

        private String[] activeProfile(String[] args) throws Exception {
            return (String[])
                    invokeStatic(
                            "getActiveProfile", new Class<?>[] {String[].class}, (Object) args);
        }

        @Test
        @DisplayName("explicit --spring.profiles.active wins over classpath detection")
        void explicitProfile() throws Exception {
            String[] result = activeProfile(new String[] {"--spring.profiles.active=foo,bar"});
            assertThat(result).containsExactly("foo", "bar");
        }

        @Test
        @DisplayName("a single explicit profile is honoured")
        void singleExplicitProfile() throws Exception {
            String[] result = activeProfile(new String[] {"--spring.profiles.active=custom"});
            assertThat(result).containsExactly("custom");
        }

        @Test
        @DisplayName("null args fall through to classpath-based detection")
        void nullArgsFallThrough() throws Exception {
            // Falls through to classpath detection; exact profile depends on the build flavor.
            String[] result = activeProfile(null);
            assertThat(result).isNotNull().isNotEmpty();
        }

        @Test
        @DisplayName("no profile arg falls through to classpath-based detection")
        void noProfileArgFallThrough() throws Exception {
            String[] result = activeProfile(new String[] {"--server.port=9090"});
            assertThat(result).isNotNull().isNotEmpty();
        }
    }

    @Nested
    @DisplayName("isClassPresent")
    class IsClassPresent {

        private boolean present(String className) throws Exception {
            return (boolean)
                    invokeStatic("isClassPresent", new Class<?>[] {String.class}, className);
        }

        @Test
        @DisplayName("returns true for a class on the classpath")
        void existingClass() throws Exception {
            assertThat(present("stirling.software.SPDF.SPDFApplication")).isTrue();
        }

        @Test
        @DisplayName("returns false for a missing class")
        void missingClass() throws Exception {
            assertThat(present("com.example.totally.Missing")).isFalse();
        }
    }

    @Nested
    @DisplayName("setServerPortStatic")
    class SetServerPortStatic {

        @Test
        @DisplayName("'auto' maps to Spring's 0 (auto-assign) port")
        void autoMapsToZero() {
            SPDFApplication.setServerPortStatic("auto");
            assertThat(SPDFApplication.getStaticPort()).isEqualTo("0");
        }

        @Test
        @DisplayName("'AUTO' is matched case-insensitively")
        void autoCaseInsensitive() {
            SPDFApplication.setServerPortStatic("AUTO");
            assertThat(SPDFApplication.getStaticPort()).isEqualTo("0");
        }

        @Test
        @DisplayName("an explicit port is stored verbatim")
        void explicitPort() {
            SPDFApplication.setServerPortStatic("8443");
            assertThat(SPDFApplication.getStaticPort()).isEqualTo("8443");
        }
    }

    @Nested
    @DisplayName("init (non-Tauri, browser disabled)")
    class InitNonTauri {

        @Test
        @DisplayName("populates the static URL fields without opening a browser")
        void initBrowserDisabled() {
            System.clearProperty("STIRLING_PDF_TAURI_MODE");
            when(appConfig.getBackendUrl()).thenReturn("http://localhost");
            when(appConfig.getContextPath()).thenReturn("/app");
            when(appConfig.getServerPort()).thenReturn("9000");
            when(env.getProperty("BROWSER_OPEN")).thenReturn(null);

            SPDFApplication app = new SPDFApplication(appConfig, env, applicationProperties);
            app.init();

            assertThat(SPDFApplication.getStaticBaseUrl()).isEqualTo("http://localhost:9000");
            assertThat(SPDFApplication.getStaticContextPath()).isEqualTo("/app");
            assertThat(SPDFApplication.getStaticPort()).isEqualTo("9000");
        }
    }

    @Test
    @DisplayName("getStaticBaseUrl reflects the most recent init")
    void staticBaseUrlReflectsInit() {
        AppConfig cfg = mock(AppConfig.class);
        when(cfg.getBackendUrl()).thenReturn("https://example.org");
        when(cfg.getContextPath()).thenReturn("/");
        when(cfg.getServerPort()).thenReturn("443");
        Environment e = mock(Environment.class);
        when(e.getProperty("BROWSER_OPEN")).thenReturn("false");

        new SPDFApplication(cfg, e, applicationProperties).init();

        // default https port 443 is omitted from the normalized base url
        assertThat(SPDFApplication.getStaticBaseUrl()).isEqualTo("https://example.org");
    }
}
