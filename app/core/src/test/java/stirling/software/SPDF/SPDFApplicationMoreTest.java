package stirling.software.SPDF;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.lang.reflect.Method;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.core.env.Environment;

import stirling.software.common.configuration.AppConfig;
import stirling.software.common.model.ApplicationProperties;

/** Static URL helpers and lifecycle branches of SPDFApplication that need no Spring context. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("SPDFApplication extra coverage")
class SPDFApplicationMoreTest {

    private static final String TAURI_PROP = "STIRLING_PDF_TAURI_MODE";
    private static final String BROWSER_OPEN = "BROWSER_OPEN";

    @Mock private AppConfig appConfig;
    @Mock private Environment env;
    @Mock private ApplicationProperties applicationProperties;

    private String originalTauri;

    @BeforeEach
    void setUp() {
        originalTauri = System.getProperty(TAURI_PROP);
        System.clearProperty(TAURI_PROP);
    }

    @AfterEach
    void tearDown() {
        if (originalTauri == null) {
            System.clearProperty(TAURI_PROP);
        } else {
            System.setProperty(TAURI_PROP, originalTauri);
        }
    }

    private static Object invokeStatic(String name, Class<?>[] sig, Object... args)
            throws Exception {
        Method m = SPDFApplication.class.getDeclaredMethod(name, sig);
        m.setAccessible(true);
        return m.invoke(null, args);
    }

    @Nested
    @DisplayName("normalizeBackendUrl")
    class NormalizeBackendUrl {

        private String normalize(String url, String port) throws Exception {
            return (String)
                    invokeStatic(
                            "normalizeBackendUrl",
                            new Class<?>[] {String.class, String.class},
                            url,
                            port);
        }

        @Test
        @DisplayName("blank backend url defaults to localhost with port")
        void blankDefaultsLocalhost() throws Exception {
            assertThat(normalize("", "8080")).isEqualTo("http://localhost:8080");
        }

        @Test
        @DisplayName("adds scheme when missing and appends non-default port")
        void addsSchemeAndPort() throws Exception {
            assertThat(normalize("example.com", "9000")).isEqualTo("http://example.com:9000");
        }

        @Test
        @DisplayName("omits default http port 80")
        void omitsDefaultHttpPort() throws Exception {
            assertThat(normalize("http://example.com", "80")).isEqualTo("http://example.com");
        }

        @Test
        @DisplayName("omits default https port 443")
        void omitsDefaultHttpsPort() throws Exception {
            assertThat(normalize("https://example.com", "443")).isEqualTo("https://example.com");
        }

        @Test
        @DisplayName("strips trailing slashes")
        void stripsTrailingSlash() throws Exception {
            assertThat(normalize("http://example.com///", "80")).isEqualTo("http://example.com");
        }

        @Test
        @DisplayName("keeps an explicit port already in the url")
        void keepsExplicitPort() throws Exception {
            assertThat(normalize("http://example.com:1234", null))
                    .isEqualTo("http://example.com:1234");
        }
    }

    @Nested
    @DisplayName("buildFullUrl")
    class BuildFullUrl {

        private String build(String base, String port, String ctx) throws Exception {
            return (String)
                    invokeStatic(
                            "buildFullUrl",
                            new Class<?>[] {String.class, String.class, String.class},
                            base,
                            port,
                            ctx);
        }

        @Test
        @DisplayName("root context path yields a single trailing slash")
        void rootContext() throws Exception {
            assertThat(build("http://localhost", "8080", "/")).isEqualTo("http://localhost:8080/");
        }

        @Test
        @DisplayName("non-root context path is prefixed with a slash")
        void prefixesContext() throws Exception {
            assertThat(build("http://localhost", "8080", "app"))
                    .isEqualTo("http://localhost:8080/app");
        }

        @Test
        @DisplayName("blank context path treated as root")
        void blankContext() throws Exception {
            assertThat(build("http://localhost", "8080", "")).isEqualTo("http://localhost:8080/");
        }
    }

    @Nested
    @DisplayName("parsePort")
    class ParsePort {

        private Integer parse(String port) throws Exception {
            return (Integer) invokeStatic("parsePort", new Class<?>[] {String.class}, port);
        }

        @Test
        @DisplayName("parses a positive port")
        void positive() throws Exception {
            assertThat(parse("8080")).isEqualTo(8080);
        }

        @Test
        @DisplayName("null for blank, non-numeric, zero, and negative")
        void invalidInputs() throws Exception {
            assertThat(parse("")).isNull();
            assertThat(parse("abc")).isNull();
            assertThat(parse("0")).isNull();
            assertThat(parse("-5")).isNull();
        }
    }

    @Nested
    @DisplayName("appendPortFallback")
    class AppendPortFallback {

        private String append(String base, Integer port) throws Exception {
            return (String)
                    invokeStatic(
                            "appendPortFallback",
                            new Class<?>[] {String.class, Integer.class},
                            base,
                            port);
        }

        @Test
        @DisplayName("null port returns base unchanged")
        void nullPort() throws Exception {
            assertThat(append("http://host", null)).isEqualTo("http://host");
        }

        @Test
        @DisplayName("base already ending in a port is unchanged")
        void alreadyHasPort() throws Exception {
            assertThat(append("http://host:1234", 80)).isEqualTo("http://host:1234");
        }

        @Test
        @DisplayName("appends the port otherwise")
        void appendsPort() throws Exception {
            assertThat(append("http://host", 8080)).isEqualTo("http://host:8080");
        }
    }

    @Nested
    @DisplayName("lifecycle")
    class Lifecycle {

        @Test
        @DisplayName("onApplicationReady picks up the runtime local.server.port")
        void onApplicationReadyUsesRuntimePort() {
            ApplicationReadyEvent event = mock(ApplicationReadyEvent.class, RETURNS_DEEP_STUBS);
            when(event.getApplicationContext().getEnvironment().getProperty("local.server.port"))
                    .thenReturn("44444");

            SPDFApplication app = new SPDFApplication(appConfig, env, applicationProperties);
            app.onApplicationReady(event);

            assertThat(SPDFApplication.getStaticPort()).isEqualTo("44444");
        }

        @Test
        @DisplayName("init in Tauri mode logs parent pid and sets static URLs")
        void initTauriMode() {
            System.setProperty(TAURI_PROP, "true");
            when(appConfig.getBackendUrl()).thenReturn("http://localhost");
            when(appConfig.getContextPath()).thenReturn("/");
            when(appConfig.getServerPort()).thenReturn("8080");
            when(env.getProperty(BROWSER_OPEN)).thenReturn("false");

            SPDFApplication app = new SPDFApplication(appConfig, env, applicationProperties);
            app.init();

            assertThat(SPDFApplication.getStaticBaseUrl()).isEqualTo("http://localhost:8080");
            assertThat(SPDFApplication.getStaticContextPath()).isEqualTo("/");
        }
    }
}
