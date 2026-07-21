package stirling.software.SPDF.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockConstruction;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
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
 * Covers the process-probing paths of ExternalAppDepConfig by intercepting ProcessBuilder
 * construction. No real external binaries are ever executed. Process mocks are wired with
 * doReturn/doAnswer to avoid nested-when stubbing inside the mockConstruction initializer.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("ExternalAppDepConfig extra coverage")
class ExternalAppDepConfigMoreTest {

    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private RuntimePathConfig runtimePathConfig;

    private ExternalAppDepConfig config;

    @BeforeEach
    void setUp() {
        when(runtimePathConfig.getWeasyPrintPath()).thenReturn("/custom/weasyprint");
        when(runtimePathConfig.getUnoConvertPath()).thenReturn("/custom/unoconvert");
        when(runtimePathConfig.getCalibrePath()).thenReturn("/custom/calibre");
        when(runtimePathConfig.getOcrMyPdfPath()).thenReturn("/custom/ocrmypdf");
        when(runtimePathConfig.getSOfficePath()).thenReturn("/custom/soffice");
        lenient()
                .when(endpointConfiguration.getEndpointsForGroup(anyString()))
                .thenReturn(Set.of());
        config = new ExternalAppDepConfig(endpointConfiguration, runtimePathConfig);
    }

    /**
     * Build a Process mock that finishes with the given exit code and stream text. Uses doReturn so
     * it can be safely called inside a mockConstruction initializer.
     */
    private static Process processReturning(int exitCode, String stdout, String stderr) {
        Process p = mock(Process.class);
        try {
            doReturn(true).when(p).waitFor(anyLong(), any(TimeUnit.class));
        } catch (InterruptedException ignored) {
            // mock never actually throws
        }
        doReturn(exitCode).when(p).exitValue();
        // Fresh stream per call so concurrent/repeated reads never race on a consumed buffer.
        doAnswer(inv -> new ByteArrayInputStream(stdout.getBytes(StandardCharsets.UTF_8)))
                .when(p)
                .getInputStream();
        doAnswer(inv -> new ByteArrayInputStream(stderr.getBytes(StandardCharsets.UTF_8)))
                .when(p)
                .getErrorStream();
        return p;
    }

    /** Make every ProcessBuilder built in scope return the supplied process from start(). */
    private static MockedConstruction<ProcessBuilder> alwaysReturn(Process p) {
        return mockConstruction(
                ProcessBuilder.class,
                (pbMock, ctx) -> {
                    try {
                        doReturn(p).when(pbMock).start();
                    } catch (Exception ignored) {
                    }
                });
    }

    private Object invoke(String name, Class<?>[] sig, Object... args) throws Exception {
        Method m = ExternalAppDepConfig.class.getDeclaredMethod(name, sig);
        m.setAccessible(true);
        return m.invoke(config, args);
    }

    @Nested
    @DisplayName("isCommandAvailable")
    class IsCommandAvailable {

        @Test
        @DisplayName("true when OS lookup (where/which) exits 0")
        void availableViaLookup() throws Exception {
            try (MockedConstruction<ProcessBuilder> ignored =
                    alwaysReturn(processReturning(0, "/usr/bin/gs", ""))) {
                boolean available =
                        (boolean) invoke("isCommandAvailable", new Class<?>[] {String.class}, "gs");
                assertThat(available).isTrue();
            }
        }

        @Test
        @DisplayName("falls back to --version when lookup fails, then true")
        void availableViaVersionFallback() throws Exception {
            try (MockedConstruction<ProcessBuilder> ignored =
                    mockConstruction(
                            ProcessBuilder.class,
                            (pbMock, ctx) -> {
                                List<?> cmd = (List<?>) ctx.arguments().get(0);
                                boolean isVersion = cmd.contains("--version");
                                doReturn(processReturning(isVersion ? 0 : 1, "1.0", ""))
                                        .when(pbMock)
                                        .start();
                            })) {
                boolean available =
                        (boolean)
                                invoke(
                                        "isCommandAvailable",
                                        new Class<?>[] {String.class},
                                        "weirdcmd");
                assertThat(available).isTrue();
            }
        }

        @Test
        @DisplayName("false when both lookup and --version fail")
        void unavailable() throws Exception {
            try (MockedConstruction<ProcessBuilder> ignored =
                    alwaysReturn(processReturning(1, "", ""))) {
                boolean available =
                        (boolean)
                                invoke("isCommandAvailable", new Class<?>[] {String.class}, "nope");
                assertThat(available).isFalse();
            }
        }
    }

    @Nested
    @DisplayName("getVersionSafe")
    class GetVersionSafe {

        @Test
        @DisplayName("extracts a version number from combined output")
        @SuppressWarnings("unchecked")
        void extractsVersion() throws Exception {
            try (MockedConstruction<ProcessBuilder> ignored =
                    alwaysReturn(processReturning(0, "qpdf version 11.9.0", ""))) {
                Optional<String> version =
                        (Optional<String>)
                                invoke(
                                        "getVersionSafe",
                                        new Class<?>[] {String.class, String.class},
                                        "qpdf",
                                        "--version");
                assertThat(version).contains("11.9.0");
            }
        }

        @Test
        @DisplayName("empty when command exits non-zero")
        @SuppressWarnings("unchecked")
        void emptyOnNonZero() throws Exception {
            try (MockedConstruction<ProcessBuilder> ignored =
                    alwaysReturn(processReturning(2, "", ""))) {
                Optional<String> version =
                        (Optional<String>)
                                invoke(
                                        "getVersionSafe",
                                        new Class<?>[] {String.class, String.class},
                                        "qpdf",
                                        "--version");
                assertThat(version).isEmpty();
            }
        }
    }

    @Nested
    @DisplayName("runAndWait")
    class RunAndWait {

        @Test
        @DisplayName("returns timeout code 124 and destroys the process when it does not finish")
        void timeoutDestroysProcess() throws Exception {
            Process p = mock(Process.class);
            doReturn(false).when(p).waitFor(anyLong(), any(TimeUnit.class));
            try (MockedConstruction<ProcessBuilder> ignored = alwaysReturn(p)) {
                Object result =
                        invoke(
                                "runAndWait",
                                new Class<?>[] {List.class, Duration.class},
                                List.of("sleep", "100"),
                                Duration.ofMillis(10));
                Method ec = result.getClass().getDeclaredMethod("exitCode");
                ec.setAccessible(true);
                assertThat((int) ec.invoke(result)).isEqualTo(124);
                verify(p).destroyForcibly();
            }
        }

        @Test
        @DisplayName("returns code 127 when ProcessBuilder.start throws IOException")
        void ioExceptionYields127() throws Exception {
            try (MockedConstruction<ProcessBuilder> ignored =
                    mockConstruction(
                            ProcessBuilder.class,
                            (pbMock, ctx) ->
                                    when(pbMock.start())
                                            .thenThrow(new java.io.IOException("cannot run")))) {
                Object result =
                        invoke(
                                "runAndWait",
                                new Class<?>[] {List.class, Duration.class},
                                List.of("bogus"),
                                Duration.ofSeconds(1));
                Method ec = result.getClass().getDeclaredMethod("exitCode");
                ec.setAccessible(true);
                assertThat((int) ec.invoke(result)).isEqualTo(127);
            }
        }
    }

    /**
     * checkDependencyAndDisableGroup is tested directly (single-threaded). The public
     * checkDependencies() fans probes out over virtual threads where Mockito's thread-confined
     * MockedConstruction would not intercept, so it is not exercised here.
     */
    @Nested
    @DisplayName("checkDependencyAndDisableGroup")
    class CheckDependencyAndDisableGroup {

        @Test
        @DisplayName("disables the affected group when the command is missing")
        void disablesMissingGroup() throws Exception {
            try (MockedConstruction<ProcessBuilder> ignored =
                    alwaysReturn(processReturning(1, "", ""))) {
                invoke("checkDependencyAndDisableGroup", new Class<?>[] {String.class}, "gs");
            }

            verify(endpointConfiguration)
                    .disableGroup("Ghostscript", EndpointConfiguration.DisableReason.DEPENDENCY);
        }

        @Test
        @DisplayName("present command with no version gate leaves the group enabled")
        void presentCommandNotDisabled() throws Exception {
            try (MockedConstruction<ProcessBuilder> ignored =
                    alwaysReturn(processReturning(0, "/usr/bin/gs", ""))) {
                invoke("checkDependencyAndDisableGroup", new Class<?>[] {String.class}, "gs");
            }

            verify(endpointConfiguration, never())
                    .disableGroup(anyString(), eq(EndpointConfiguration.DisableReason.DEPENDENCY));
        }

        @Test
        @DisplayName("qpdf below the required version disables the qpdf group")
        void qpdfBelowMinimumDisabled() throws Exception {
            // Lookup succeeds (exit 0) and --version reports an old release -> version gate fires.
            try (MockedConstruction<ProcessBuilder> ignored =
                    alwaysReturn(processReturning(0, "qpdf version 10.0.0", ""))) {
                invoke("checkDependencyAndDisableGroup", new Class<?>[] {String.class}, "qpdf");
            }

            verify(endpointConfiguration)
                    .disableGroup("qpdf", EndpointConfiguration.DisableReason.DEPENDENCY);
        }

        @Test
        @DisplayName("qpdf at or above the required version stays enabled")
        void qpdfMeetsMinimumNotDisabled() throws Exception {
            try (MockedConstruction<ProcessBuilder> ignored =
                    alwaysReturn(processReturning(0, "qpdf version 12.5.0", ""))) {
                invoke("checkDependencyAndDisableGroup", new Class<?>[] {String.class}, "qpdf");
            }

            verify(endpointConfiguration, never())
                    .disableGroup(anyString(), eq(EndpointConfiguration.DisableReason.DEPENDENCY));
        }

        @Test
        @DisplayName("weasyprint below the required version disables the weasyprint group")
        void weasyprintBelowMinimumDisabled() throws Exception {
            try (MockedConstruction<ProcessBuilder> ignored =
                    alwaysReturn(processReturning(0, "WeasyPrint 50.0", ""))) {
                invoke(
                        "checkDependencyAndDisableGroup",
                        new Class<?>[] {String.class},
                        "/custom/weasyprint");
            }

            verify(endpointConfiguration)
                    .disableGroup("Weasyprint", EndpointConfiguration.DisableReason.DEPENDENCY);
        }
    }
}
