package stirling.software.SPDF.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockConstruction;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.MockedConstruction;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import stirling.software.common.configuration.RuntimePathConfig;

/**
 * Pure-helper coverage for {@link ExternalAppDepConfig}: the inner Version comparator, the
 * weasyprint/qpdf command recognisers, feature-name formatting and the findFirstAvailable probe
 * loop. No real binaries run; ProcessBuilder is intercepted where a probe is required.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("ExternalAppDepConfig helper coverage")
class ExternalAppDepConfigExtraTest {

    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private RuntimePathConfig runtimePathConfig;

    private ExternalAppDepConfig config;

    @BeforeEach
    void setUp() {
        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/opt/weasyprint");
        when(runtimePathConfig.getUnoConvertPath()).thenReturn("/opt/unoconvert");
        when(runtimePathConfig.getCalibrePath()).thenReturn("/opt/calibre");
        when(runtimePathConfig.getOcrMyPdfPath()).thenReturn("/opt/ocrmypdf");
        when(runtimePathConfig.getSOfficePath()).thenReturn("/opt/soffice");
        lenient()
                .when(endpointConfiguration.getEndpointsForGroup(anyString()))
                .thenReturn(Set.of());
        config = new ExternalAppDepConfig(endpointConfiguration, runtimePathConfig);
    }

    private Object invoke(String name, Class<?>[] sig, Object... args) throws Exception {
        Method m = ExternalAppDepConfig.class.getDeclaredMethod(name, sig);
        m.setAccessible(true);
        return m.invoke(config, args);
    }

    private static Process processReturning(int exitCode, String stdout) {
        Process p = mock(Process.class);
        try {
            doReturn(true).when(p).waitFor(anyLong(), any(TimeUnit.class));
        } catch (InterruptedException ignored) {
            // mock never throws
        }
        doReturn(exitCode).when(p).exitValue();
        doAnswer(inv -> new ByteArrayInputStream(stdout.getBytes(StandardCharsets.UTF_8)))
                .when(p)
                .getInputStream();
        doAnswer(inv -> new ByteArrayInputStream(new byte[0])).when(p).getErrorStream();
        return p;
    }

    @Nested
    @DisplayName("Version comparator")
    class VersionComparator {

        private Comparable<Object> version(String v) throws Exception {
            Class<?> versionClass =
                    Class.forName("stirling.software.SPDF.config.ExternalAppDepConfig$Version");
            Constructor<?> ctor = versionClass.getDeclaredConstructor(String.class);
            ctor.setAccessible(true);
            @SuppressWarnings("unchecked")
            Comparable<Object> instance = (Comparable<Object>) ctor.newInstance(v);
            return instance;
        }

        @Test
        @DisplayName("orders by major, then minor, then patch")
        void ordersBySegments() throws Exception {
            assertThat(version("1.2.3").compareTo(version("1.2.4"))).isNegative();
            assertThat(version("2.0.0").compareTo(version("1.9.9"))).isPositive();
            assertThat(version("1.2.0").compareTo(version("1.2"))).isZero();
        }

        @Test
        @DisplayName("treats equal versions as equal")
        void equalVersions() throws Exception {
            assertThat(version("58.0").compareTo(version("58.0.0"))).isZero();
        }

        @Test
        @DisplayName("non-numeric segments are treated as zero")
        void nonNumericSegmentsAsZero() throws Exception {
            // "12.x" -> 12.0.0, equal to "12"
            assertThat(version("12.x").compareTo(version("12"))).isZero();
        }

        @Test
        @DisplayName("toString renders the three-segment form")
        void toStringThreeSegments() throws Exception {
            assertThat(version("11.9").toString()).isEqualTo("11.9.0");
        }
    }

    @Nested
    @DisplayName("command recognisers")
    class CommandRecognisers {

        private boolean isWeasyprint(String command) throws Exception {
            return (boolean) invoke("isWeasyprint", new Class<?>[] {String.class}, command);
        }

        private boolean isQpdf(String command) throws Exception {
            return (boolean) invoke("isQpdf", new Class<?>[] {String.class}, command);
        }

        @Test
        @DisplayName("isWeasyprint matches the configured path and any name containing weasyprint")
        void weasyprintMatches() throws Exception {
            assertThat(isWeasyprint("/opt/weasyprint")).isTrue();
            assertThat(isWeasyprint("WeasyPrint")).isTrue();
            assertThat(isWeasyprint("gs")).isFalse();
        }

        @Test
        @DisplayName("isQpdf matches any name containing qpdf, case-insensitively")
        void qpdfMatches() throws Exception {
            assertThat(isQpdf("qpdf")).isTrue();
            assertThat(isQpdf("/usr/bin/QPDF")).isTrue();
            assertThat(isQpdf("tesseract")).isFalse();
        }
    }

    @Nested
    @DisplayName("feature-name formatting")
    class FeatureFormatting {

        private String capitalizeWord(String word) throws Exception {
            return (String) invoke("capitalizeWord", new Class<?>[] {String.class}, word);
        }

        private String formatEndpointAsFeature(String endpoint) throws Exception {
            return (String)
                    invoke("formatEndpointAsFeature", new Class<?>[] {String.class}, endpoint);
        }

        @Test
        @DisplayName("capitalizeWord upper-cases the first letter and lowers the rest")
        void capitalizes() throws Exception {
            assertThat(capitalizeWord("hello")).isEqualTo("Hello");
            assertThat(capitalizeWord("WORLD")).isEqualTo("World");
        }

        @Test
        @DisplayName("capitalizeWord keeps pdf fully upper-cased")
        void capitalizesPdf() throws Exception {
            assertThat(capitalizeWord("pdf")).isEqualTo("PDF");
            assertThat(capitalizeWord("PDF")).isEqualTo("PDF");
        }

        @Test
        @DisplayName("capitalizeWord returns null/empty unchanged")
        void capitalizeEmpty() throws Exception {
            assertThat(capitalizeWord("")).isEmpty();
            assertThat(capitalizeWord((String) null)).isNull();
        }

        @Test
        @DisplayName("formatEndpointAsFeature humanises a hyphenated endpoint with pdf/img mapping")
        void humanisesEndpoint() throws Exception {
            // "pdf-to-img" -> tokens pdf,to,image -> "PDF To Image"
            assertThat(formatEndpointAsFeature("pdf-to-img")).isEqualTo("PDF To Image");
        }

        @Test
        @DisplayName("formatEndpointAsFeature title-cases a plain endpoint")
        void titleCasesPlain() throws Exception {
            assertThat(formatEndpointAsFeature("merge-pdfs")).contains("Merge");
        }
    }

    @Nested
    @DisplayName("findFirstAvailable")
    class FindFirstAvailable {

        @SuppressWarnings("unchecked")
        private Optional<String> findFirstAvailable(List<String> commands) throws Exception {
            return (Optional<String>)
                    invoke("findFirstAvailable", new Class<?>[] {List.class}, commands);
        }

        @Test
        @DisplayName("returns the first command whose lookup probe succeeds")
        void returnsFirstSuccessful() throws Exception {
            // python3 lookup fails (exit 1), python lookup succeeds (exit 0)
            try (MockedConstruction<ProcessBuilder> ignored =
                    mockConstruction(
                            ProcessBuilder.class,
                            (pbMock, ctx) -> {
                                List<?> cmd = (List<?>) ctx.arguments().get(0);
                                boolean python = cmd.contains("python");
                                doReturn(processReturning(python ? 0 : 1, "")).when(pbMock).start();
                            })) {
                Optional<String> result = findFirstAvailable(List.of("python3", "python"));
                assertThat(result).contains("python");
            }
        }

        @Test
        @DisplayName("returns empty when no command is available")
        void emptyWhenNoneAvailable() throws Exception {
            try (MockedConstruction<ProcessBuilder> ignored =
                    mockConstruction(
                            ProcessBuilder.class,
                            (pbMock, ctx) ->
                                    doReturn(processReturning(1, "")).when(pbMock).start())) {
                Optional<String> result = findFirstAvailable(List.of("nope1", "nope2"));
                assertThat(result).isEmpty();
            }
        }
    }
}
