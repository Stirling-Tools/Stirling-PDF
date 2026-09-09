package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.function.Predicate;
import java.util.function.UnaryOperator;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.LoggerFactory;

import stirling.software.common.util.ProcessExecutor.OfficeNetworkGuard;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

/**
 * Covers the LD_PRELOAD egress guard applied to locally launched LibreOffice: which environments
 * resolve it, which commands it recognises as the engine, and the fact that every fail-open path is
 * audible rather than silent.
 */
class ProcessExecutorOfficeNetworkGuardTest {

    private static final String GUARD_PATH = OfficeNetworkGuard.DEFAULT_LIBRARY_PATH;

    private static UnaryOperator<String> env(String... keysAndValues) {
        Map<String, String> values = new LinkedHashMap<>();
        for (int i = 0; i < keysAndValues.length; i += 2) {
            values.put(keysAndValues[i], keysAndValues[i + 1]);
        }
        return values::get;
    }

    private static final Predicate<Path> GUARD_PRESENT = path -> GUARD_PATH.equals(path.toString());
    private static final Predicate<Path> NOTHING_PRESENT = path -> false;

    private static OfficeNetworkGuard activeGuard() {
        OfficeNetworkGuard guard = OfficeNetworkGuard.resolve(env(), "Linux", GUARD_PRESENT);
        assertThat(guard.isActive()).isTrue();
        return guard;
    }

    private static OfficeNetworkGuard inactiveGuard() {
        OfficeNetworkGuard guard = OfficeNetworkGuard.resolve(env(), "Linux", NOTHING_PRESENT);
        assertThat(guard.isActive()).isFalse();
        return guard;
    }

    @Nested
    @DisplayName("LIBREOFFICE_ALLOW_NETWORK")
    class AllowNetwork {

        @ParameterizedTest
        @ValueSource(strings = {"1", "true", "yes", "on", "TRUE", "Yes", "ON", "  true  "})
        @DisplayName("truthy values turn the guard off and record that they did")
        void truthyValuesDisableTheGuard(String value) {
            OfficeNetworkGuard guard =
                    OfficeNetworkGuard.resolve(
                            env("LIBREOFFICE_ALLOW_NETWORK", value), "Linux", GUARD_PRESENT);

            assertThat(guard.isActive()).isFalse();
            assertThat(guard.getLibraryPath()).isNull();
            assertThat(guard.getUnavailableReason())
                    .contains("LIBREOFFICE_ALLOW_NETWORK")
                    .contains(value.trim());
        }

        @ParameterizedTest
        @ValueSource(
                strings = {"0", "false", "no", "off", "", "   ", "y", "t", "enabled", "true1", "2"})
        @DisplayName("anything else leaves the guard on")
        void otherValuesLeaveTheGuardOn(String value) {
            OfficeNetworkGuard guard =
                    OfficeNetworkGuard.resolve(
                            env("LIBREOFFICE_ALLOW_NETWORK", value), "Linux", GUARD_PRESENT);

            assertThat(guard.isActive()).isTrue();
            assertThat(guard.getLibraryPath()).isEqualTo(GUARD_PATH);
        }

        @Test
        @DisplayName("unset leaves the guard on")
        void unsetLeavesTheGuardOn() {
            assertThat(OfficeNetworkGuard.resolve(env(), "Linux", GUARD_PRESENT).isActive())
                    .isTrue();
        }
    }

    @Nested
    @DisplayName("resolution")
    class Resolution {

        @Test
        @DisplayName("the shipped library path is used when no override is set")
        void defaultLibraryPath() {
            OfficeNetworkGuard guard = OfficeNetworkGuard.resolve(env(), "Linux", GUARD_PRESENT);

            assertThat(guard.getLibraryPath()).isEqualTo(GUARD_PATH);
            assertThat(guard.getUnavailableReason()).isNull();
        }

        @Test
        @DisplayName("LIBREOFFICE_NETWORK_GUARD_LIB overrides the path and is trimmed")
        void overrideLibraryPath() {
            OfficeNetworkGuard guard =
                    OfficeNetworkGuard.resolve(
                            env("LIBREOFFICE_NETWORK_GUARD_LIB", "  /opt/custom/guard.so  "),
                            "Linux",
                            path -> "/opt/custom/guard.so".equals(path.toString()));

            assertThat(guard.getLibraryPath()).isEqualTo("/opt/custom/guard.so");
        }

        @ParameterizedTest
        @ValueSource(strings = {"", "   "})
        @DisplayName("a blank override falls back to the shipped path")
        void blankOverrideFallsBack(String override) {
            OfficeNetworkGuard guard =
                    OfficeNetworkGuard.resolve(
                            env("LIBREOFFICE_NETWORK_GUARD_LIB", override), "Linux", GUARD_PRESENT);

            assertThat(guard.getLibraryPath()).isEqualTo(GUARD_PATH);
        }

        @Test
        @DisplayName("a missing library is inactive and names the path it looked for")
        void missingLibraryIsReported() {
            OfficeNetworkGuard guard = OfficeNetworkGuard.resolve(env(), "Linux", NOTHING_PRESENT);

            assertThat(guard.isActive()).isFalse();
            assertThat(guard.getUnavailableReason()).contains(GUARD_PATH).contains("missing");
        }

        @Test
        @DisplayName("a missing override library is inactive and names the override")
        void missingOverrideLibraryIsReported() {
            OfficeNetworkGuard guard =
                    OfficeNetworkGuard.resolve(
                            env("LIBREOFFICE_NETWORK_GUARD_LIB", "/opt/custom/guard.so"),
                            "Linux",
                            NOTHING_PRESENT);

            assertThat(guard.isActive()).isFalse();
            assertThat(guard.getUnavailableReason()).contains("/opt/custom/guard.so");
        }

        @ParameterizedTest
        @NullSource
        @ValueSource(strings = {"Mac OS X", "Windows 11", "SunOS", "FreeBSD"})
        @DisplayName("a non-Linux host is inactive even when the library file is there")
        void nonLinuxIsInactive(String osName) {
            OfficeNetworkGuard guard = OfficeNetworkGuard.resolve(env(), osName, GUARD_PRESENT);

            assertThat(guard.isActive()).isFalse();
            assertThat(guard.getLibraryPath()).isNull();
            assertThat(guard.getUnavailableReason()).contains("Linux");
        }

        @ParameterizedTest
        @ValueSource(strings = {"Linux", "LINUX", "linux"})
        @DisplayName("os.name is matched case-insensitively")
        void linuxIsMatchedCaseInsensitively(String osName) {
            assertThat(OfficeNetworkGuard.resolve(env(), osName, GUARD_PRESENT).isActive())
                    .isTrue();
        }

        @Test
        @DisplayName("an unusable library path is inactive rather than fatal")
        void unusableLibraryPathIsInactive() {
            OfficeNetworkGuard guard =
                    OfficeNetworkGuard.resolve(
                            env("LIBREOFFICE_NETWORK_GUARD_LIB", "/opt/gu\0ard.so"),
                            "Linux",
                            GUARD_PRESENT);

            assertThat(guard.isActive()).isFalse();
            assertThat(guard.getUnavailableReason()).isNotBlank();
        }

        @Test
        @DisplayName("the guard resolved for this host is consistent, and inactive off Linux")
        void resolvedForThisHost() {
            OfficeNetworkGuard guard = OfficeNetworkGuard.resolveAndReport();

            assertThat(guard).isNotNull();
            if (guard.isActive()) {
                assertThat(guard.getLibraryPath()).isNotBlank();
                assertThat(guard.getUnavailableReason()).isNull();
            } else {
                assertThat(guard.getUnavailableReason()).isNotBlank();
            }
            boolean linux =
                    System.getProperty("os.name", "").toLowerCase(Locale.ROOT).startsWith("linux");
            if (!linux) {
                assertThat(guard.isActive()).isFalse();
                assertThat(guard.getUnavailableReason()).contains("Linux");
            }
        }
    }

    @Nested
    @DisplayName("executable matching")
    class ExecutableMatching {

        @ParameterizedTest
        @ValueSource(
                strings = {
                    "soffice",
                    "/usr/bin/soffice",
                    "/usr/lib/libreoffice/program/soffice.bin",
                    "/usr/bin/libreoffice",
                    "/usr/bin/libreoffice24.2",
                    "libreoffice",
                    "loffice",
                    "lowriter",
                    "soffice.exe",
                    "SOFFICE.EXE",
                    "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
                    "/opt/vendor/office-launcher"
                })
        @DisplayName("every office engine spelling is guarded, symlink and .exe included")
        void engineCommandsAreGuarded(String executable) {
            assertThat(ProcessExecutor.shouldGuardOfficeCommand(List.of(executable, "--headless")))
                    .isTrue();
            assertThat(ProcessExecutor.isUnoClientCommand(List.of(executable))).isFalse();
        }

        @ParameterizedTest
        @ValueSource(
                strings = {
                    "unoconvert",
                    "/usr/local/bin/unoconvert",
                    "unoconvert.exe",
                    "UNOCONVERT",
                    "C:\\Python\\Scripts\\unoconvert.exe",
                    "unoconv",
                    "unoconvert3"
                })
        @DisplayName("the unoserver client is left alone so remote-UNO can dial out")
        void unoClientIsNotGuarded(String executable) {
            assertThat(ProcessExecutor.isUnoClientCommand(List.of(executable))).isTrue();
            assertThat(ProcessExecutor.shouldGuardOfficeCommand(List.of(executable))).isFalse();
        }

        @Test
        @DisplayName("an absent executable matches nothing")
        void emptyCommandsMatchNothing() {
            List<String> blank = List.of("   ");
            List<String> nullFirst = Arrays.asList(null, "x");

            assertThat(ProcessExecutor.shouldGuardOfficeCommand(null)).isFalse();
            assertThat(ProcessExecutor.shouldGuardOfficeCommand(List.of())).isFalse();
            assertThat(ProcessExecutor.shouldGuardOfficeCommand(nullFirst)).isFalse();
            assertThat(ProcessExecutor.shouldGuardOfficeCommand(blank)).isFalse();
            assertThat(ProcessExecutor.isUnoClientCommand(null)).isFalse();
            assertThat(ProcessExecutor.isUnoClientCommand(List.of())).isFalse();
            assertThat(ProcessExecutor.isUnoClientCommand(nullFirst)).isFalse();
        }
    }

    @Nested
    @DisplayName("applying the guard")
    class Applying {

        private ProcessBuilder builder;

        @BeforeEach
        void newBuilder() {
            builder = new ProcessBuilder("echo");
            builder.environment().remove("LD_PRELOAD");
        }

        @Test
        @DisplayName("an engine command gets LD_PRELOAD")
        void enginePreloaded() {
            activeGuard().apply(builder, List.of("/usr/bin/soffice", "--headless"));

            assertThat(builder.environment()).containsEntry("LD_PRELOAD", GUARD_PATH);
        }

        @Test
        @DisplayName("the libreoffice symlink gets LD_PRELOAD too")
        void symlinkPreloaded() {
            activeGuard().apply(builder, List.of("/usr/bin/libreoffice", "--headless"));

            assertThat(builder.environment()).containsEntry("LD_PRELOAD", GUARD_PATH);
        }

        @Test
        @DisplayName("an inherited LD_PRELOAD is kept behind the guard")
        void existingPreloadIsKept() {
            builder.environment().put("LD_PRELOAD", "/lib/other.so");

            activeGuard().apply(builder, List.of("soffice"));

            assertThat(builder.environment())
                    .containsEntry("LD_PRELOAD", GUARD_PATH + " /lib/other.so");
        }

        @Test
        @DisplayName("a blank inherited LD_PRELOAD is replaced, not appended to")
        void blankExistingPreloadIsReplaced() {
            builder.environment().put("LD_PRELOAD", "  ");

            activeGuard().apply(builder, List.of("soffice"));

            assertThat(builder.environment()).containsEntry("LD_PRELOAD", GUARD_PATH);
        }

        @Test
        @DisplayName("the unoserver client keeps its environment untouched")
        void unoClientNotPreloaded() {
            activeGuard().apply(builder, List.of("/usr/local/bin/unoconvert", "--convert-to"));

            assertThat(builder.environment()).doesNotContainKey("LD_PRELOAD");
        }
    }

    @Nested
    @DisplayName("fail-open is audible")
    class FailOpenIsAudible {

        private ListAppender<ILoggingEvent> appender;
        private Logger logger;
        private Level originalLevel;

        @BeforeEach
        void captureLogs() {
            logger = (Logger) LoggerFactory.getLogger(ProcessExecutor.class);
            originalLevel = logger.getLevel();
            logger.setLevel(Level.INFO);
            appender = new ListAppender<>();
            appender.start();
            logger.addAppender(appender);
        }

        @AfterEach
        void releaseLogs() {
            logger.detachAppender(appender);
            appender.stop();
            logger.setLevel(originalLevel);
        }

        private List<String> warnings() {
            return appender.list.stream()
                    .filter(event -> event.getLevel() == Level.WARN)
                    .map(ILoggingEvent::getFormattedMessage)
                    .toList();
        }

        @Test
        @DisplayName("an unguarded engine still runs, but says so with the reason")
        void unguardedEngineWarns() {
            OfficeNetworkGuard guard = inactiveGuard();
            ProcessBuilder builder = new ProcessBuilder("echo");
            builder.environment().remove("LD_PRELOAD");

            guard.apply(builder, List.of("/usr/bin/soffice", "--headless"));

            assertThat(builder.environment()).doesNotContainKey("LD_PRELOAD");
            assertThat(warnings())
                    .singleElement()
                    .asString()
                    .contains("/usr/bin/soffice")
                    .contains(GUARD_PATH);
        }

        @Test
        @DisplayName("LIBREOFFICE_ALLOW_NETWORK is named as the reason when it is the reason")
        void allowNetworkIsNamedInTheWarning() {
            OfficeNetworkGuard guard =
                    OfficeNetworkGuard.resolve(
                            env("LIBREOFFICE_ALLOW_NETWORK", "true"), "Linux", GUARD_PRESENT);

            guard.apply(new ProcessBuilder("echo"), List.of("/usr/bin/soffice"));

            assertThat(warnings()).singleElement().asString().contains("LIBREOFFICE_ALLOW_NETWORK");
        }

        @Test
        @DisplayName("a non-Linux host is named as the reason when it is the reason")
        void nonLinuxIsNamedInTheWarning() {
            OfficeNetworkGuard guard = OfficeNetworkGuard.resolve(env(), "Mac OS X", GUARD_PRESENT);

            guard.apply(new ProcessBuilder("echo"), List.of("/usr/bin/soffice"));

            assertThat(warnings()).singleElement().asString().contains("Linux");
        }

        @Test
        @DisplayName("the warning is once per executable, not once per conversion")
        void warnsOncePerExecutable() {
            OfficeNetworkGuard guard = inactiveGuard();

            guard.apply(new ProcessBuilder("echo"), List.of("/usr/bin/soffice"));
            guard.apply(new ProcessBuilder("echo"), List.of("/usr/bin/soffice"));
            guard.apply(new ProcessBuilder("echo"), List.of("/usr/bin/soffice"));
            guard.apply(new ProcessBuilder("echo"), List.of("/usr/bin/libreoffice"));

            assertThat(warnings()).hasSize(2);
            assertThat(warnings().get(0)).contains("/usr/bin/soffice");
            assertThat(warnings().get(1)).contains("/usr/bin/libreoffice");
        }

        @Test
        @DisplayName("an unguarded unoserver client is not warned about")
        void unoClientDoesNotWarn() {
            inactiveGuard().apply(new ProcessBuilder("echo"), List.of("unoconvert"));

            assertThat(warnings()).isEmpty();
        }

        @Test
        @DisplayName("resolution reports its outcome at startup either way")
        void resolutionIsReported() {
            OfficeNetworkGuard.resolveAndReport();

            assertThat(appender.list)
                    .filteredOn(event -> event.getLevel() == Level.INFO)
                    .extracting(ILoggingEvent::getFormattedMessage)
                    .anySatisfy(message -> assertThat(message).contains("network guard"));
        }
    }
}
