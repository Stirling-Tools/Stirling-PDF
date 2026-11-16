package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
import org.mockito.MockedConstruction;
import org.mockito.MockedStatic;
import org.mockito.Mockito;

import stirling.software.common.util.CalibreSandboxPolicy.Mode;
import stirling.software.common.util.CalibreSandboxPolicy.Probe;

class CalibreSandboxPolicyTest {

    private static final Path LAUNCHER = Path.of("/configs/scripts/python/calibre_sandbox.py");
    private static final String LEAKED_SECRET = "13d99fb9-25db-44bc-beb5-1c504957b9df";

    @TempDir Path workDir;

    private List<String> command;
    private List<String> confinedCommand;
    private MockedStatic<GeneralUtils> generalUtils;
    private MockedStatic<CheckProgramInstall> checkProgramInstall;

    @BeforeEach
    void setUp() {
        command =
                List.of(
                        "ebook-convert",
                        workDir.resolve("book.mobi").toString(),
                        workDir.resolve("book.pdf").toString());
        confinedCommand =
                List.of(
                        "python3",
                        "-I",
                        LAUNCHER.toString(),
                        workDir.toString(),
                        command.get(0),
                        command.get(1),
                        command.get(2));
        generalUtils = Mockito.mockStatic(GeneralUtils.class);
        generalUtils
                .when(() -> GeneralUtils.extractScript(CalibreSandboxPolicy.LAUNCHER))
                .thenReturn(LAUNCHER);
        checkProgramInstall = Mockito.mockStatic(CheckProgramInstall.class);
        checkProgramInstall
                .when(CheckProgramInstall::getAvailablePythonCommand)
                .thenReturn("python3");
    }

    @AfterEach
    void tearDown() {
        checkProgramInstall.close();
        generalUtils.close();
        ProcessExecutor.setCalibreSandboxMode(CalibreSandboxPolicy.configuredMode());
    }

    @Test
    void sandboxIsOnByDefault() {
        assertThat(CalibreSandboxPolicy.resolveMode(null)).isEqualTo(Mode.ON);
        assertThat(CalibreSandboxPolicy.resolveMode(" ")).isEqualTo(Mode.ON);
    }

    @Test
    void onlyOffTurnsTheSandboxOff() {
        assertThat(CalibreSandboxPolicy.resolveMode("off")).isEqualTo(Mode.OFF);
        assertThat(CalibreSandboxPolicy.resolveMode(" OFF ")).isEqualTo(Mode.OFF);
        for (String value : List.of("on", "required", "enforce", "best-effort", "disabled")) {
            assertThat(CalibreSandboxPolicy.resolveMode(value)).as(value).isEqualTo(Mode.ON);
        }
    }

    @Test
    void commandIsWrappedInTheLauncherAndConfinedToTheWorkingDirectory() throws IOException {
        assertThat(
                        CalibreSandboxPolicy.confine(
                                Mode.ON, command, workDir.toFile(), new HashMap<>()))
                .isEqualTo(confinedCommand);
    }

    @Test
    void offLeavesTheCommandAlone() throws IOException {
        assertThat(
                        CalibreSandboxPolicy.confine(
                                Mode.OFF, command, workDir.toFile(), new HashMap<>()))
                .isEqualTo(command);
    }

    @Test
    void secretsInTheEnvironmentDoNotReachCalibre() throws IOException {
        Map<String, String> env = new HashMap<>();
        env.put("SECURITY_CUSTOMGLOBALAPIKEY", "secret");
        env.put("PYTHONPATH", "/opt/venv/lib/python3.12/site-packages");
        env.put("XDG_CONFIG_HOME", "/home/stirlingpdfuser/.config");
        env.put("HOME", "/home/stirlingpdfuser");
        env.put("TMPDIR", "/tmp/stirling-pdf");
        env.put("PATH", "/usr/bin");
        env.put("LC_ALL", "C.UTF-8");
        env.put("QTWEBENGINE_CHROMIUM_FLAGS", "--disable-gpu");

        CalibreSandboxPolicy.confine(Mode.ON, command, workDir.toFile(), env);

        String home = workDir.resolve(".calibre").toString();
        assertThat(env)
                .containsOnly(
                        Map.entry("HOME", home),
                        Map.entry("TMPDIR", home),
                        Map.entry("TMP", home),
                        Map.entry("TEMP", home),
                        Map.entry("XDG_RUNTIME_DIR", home),
                        Map.entry("PATH", "/usr/bin"),
                        Map.entry("LC_ALL", "C.UTF-8"),
                        Map.entry("QTWEBENGINE_CHROMIUM_FLAGS", "--disable-gpu"));
        assertThat(Path.of(home)).isDirectory();
    }

    @Test
    void aJobWithoutAWorkingDirectoryIsRefused() {
        assertThatThrownBy(
                        () -> CalibreSandboxPolicy.confine(Mode.ON, command, null, new HashMap<>()))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("working directory");
    }

    @Test
    void withoutPythonCalibreIsRefused() {
        checkProgramInstall.when(CheckProgramInstall::getAvailablePythonCommand).thenReturn(null);

        assertThatThrownBy(
                        () ->
                                CalibreSandboxPolicy.confine(
                                        Mode.ON, command, workDir.toFile(), new HashMap<>()))
                .isInstanceOf(IOException.class)
                .hasMessage(CalibreSandboxPolicy.REFUSED_MESSAGE);
    }

    @Test
    void probeClassifiesWhatTheLauncherReports() {
        String landlock = "calibre-sandbox: landlock unavailable, refusing to run";
        assertThat(CalibreSandboxPolicy.classifyProbe(0, List.of())).isEqualTo(Probe.ACTIVE);
        assertThat(CalibreSandboxPolicy.classifyProbe(0, List.of(landlock)))
                .isEqualTo(Probe.REFUSED);
        assertThat(
                        CalibreSandboxPolicy.classifyProbe(
                                CalibreSandboxPolicy.LAUNCHER_REFUSED_EXIT_CODE, List.of(landlock)))
                .isEqualTo(Probe.REFUSED);
        assertThat(CalibreSandboxPolicy.classifyProbe(1, List.of())).isEqualTo(Probe.UNKNOWN);
    }

    private static final List<String> PROBE = List.of("ebook-convert", "--version");

    @Test
    void startupProbeRunsCalibreThroughTheLauncherAndCleansUp() {
        try (MockedConstruction<ProcessBuilder> builders = calibre(0, "")) {
            assertThat(CalibreSandboxPolicy.probeAtStartup(Mode.ON, PROBE)).isTrue();

            ProcessBuilder builder = builders.constructed().getFirst();
            verify(builder)
                    .command(
                            org.mockito.ArgumentMatchers.<List<String>>argThat(
                                    cmd ->
                                            cmd.subList(0, 3)
                                                            .equals(
                                                                    List.of(
                                                                            "python3",
                                                                            "-I",
                                                                            LAUNCHER.toString()))
                                                    && cmd.subList(cmd.size() - 2, cmd.size())
                                                            .equals(PROBE)));
            ArgumentCaptor<File> probeDir = ArgumentCaptor.forClass(File.class);
            verify(builder).directory(probeDir.capture());
            assertThat(probeDir.getValue()).doesNotExist();
        }
    }

    @Test
    void startupProbeRefusalDisablesCalibre() {
        try (MockedConstruction<ProcessBuilder> ignored =
                calibre(
                        CalibreSandboxPolicy.LAUNCHER_REFUSED_EXIT_CODE,
                        "calibre-sandbox: landlock unavailable, refusing to run\n")) {
            assertThat(CalibreSandboxPolicy.probeAtStartup(Mode.ON, PROBE)).isFalse();
        }
    }

    @Test
    void startupProbeLaunchesNothingWhenTheSandboxIsOff() {
        try (MockedConstruction<ProcessBuilder> builders = calibre(0, "")) {
            assertThat(CalibreSandboxPolicy.probeAtStartup(Mode.OFF, PROBE)).isTrue();
            assertThat(builders.constructed()).isEmpty();
        }
    }

    @Test
    void startupProbeThatDoesNotFinishIsNotActive() {
        ProcessHandle calibreChild = mock(ProcessHandle.class);
        try (MockedConstruction<ProcessBuilder> builders = calibre(0, "", false, calibreChild)) {
            assertThat(CalibreSandboxPolicy.probeAtStartup(Mode.ON, PROBE)).isFalse();
            verify(calibreChild).destroyForcibly();

            ArgumentCaptor<File> probeDir = ArgumentCaptor.forClass(File.class);
            verify(builders.constructed().getFirst()).directory(probeDir.capture());
            assertThat(probeDir.getValue()).doesNotExist();
        }
    }

    @Test
    void startupProbeWithoutPythonLaunchesNothing() {
        checkProgramInstall.when(CheckProgramInstall::getAvailablePythonCommand).thenReturn(null);
        try (MockedConstruction<ProcessBuilder> builders = calibre(0, "")) {
            assertThat(CalibreSandboxPolicy.probeAtStartup(Mode.ON, PROBE)).isFalse();
            assertThat(builders.constructed()).allSatisfy(b -> verify(b, never()).start());
        }
    }

    private static MockedConstruction<ProcessBuilder> calibre(int exitCode, String stderr) {
        return calibre(exitCode, stderr, true);
    }

    /**
     * Stands in for the launcher: stderr arrives on the process's stream and, for callers that
     * redirect it, in the file they named.
     */
    private static MockedConstruction<ProcessBuilder> calibre(
            int exitCode, String stderr, boolean finishes, ProcessHandle... descendants) {
        return Mockito.mockConstruction(
                ProcessBuilder.class,
                (builder, context) -> {
                    Process process = mock(Process.class);
                    when(process.getInputStream())
                            .thenReturn(new ByteArrayInputStream(new byte[0]));
                    when(process.getErrorStream())
                            .thenReturn(
                                    new ByteArrayInputStream(
                                            stderr.getBytes(StandardCharsets.UTF_8)));
                    when(process.waitFor(anyLong(), any(TimeUnit.class))).thenReturn(finishes);
                    when(process.exitValue()).thenReturn(exitCode);
                    when(process.descendants()).thenAnswer(invocation -> Stream.of(descendants));
                    when(builder.environment()).thenReturn(new HashMap<>());
                    when(builder.redirectError(any(File.class)))
                            .thenAnswer(
                                    invocation -> {
                                        Files.writeString(
                                                invocation.<File>getArgument(0).toPath(), stderr);
                                        return builder;
                                    });
                    when(builder.start()).thenReturn(process);
                });
    }

    private void runCalibre() throws Exception {
        ProcessExecutor.getInstance(ProcessExecutor.Processes.CALIBRE)
                .runCommandWithOutputHandling(command, workDir.toFile());
    }

    @Test
    void processExecutorLaunchesCalibreConfined() throws Exception {
        ProcessExecutor.setCalibreSandboxMode(Mode.ON);
        try (MockedConstruction<ProcessBuilder> builders = calibre(0, "")) {
            runCalibre();

            verify(builders.constructed().getFirst()).command(confinedCommand);
        }
    }

    @Test
    void offModeLaunchesCalibreUnchanged() throws Exception {
        ProcessExecutor.setCalibreSandboxMode(Mode.OFF);
        try (MockedConstruction<ProcessBuilder> builders = calibre(0, "")) {
            runCalibre();

            verify(builders.constructed().getFirst()).command(command);
        }
    }

    @Test
    void processExecutorDoesNotStartCalibreWithoutPython() throws Exception {
        ProcessExecutor.setCalibreSandboxMode(Mode.ON);
        checkProgramInstall.when(CheckProgramInstall::getAvailablePythonCommand).thenReturn(null);
        try (MockedConstruction<ProcessBuilder> builders = calibre(0, "")) {
            assertThatThrownBy(this::runCalibre)
                    .isInstanceOf(IOException.class)
                    .hasMessage(CalibreSandboxPolicy.REFUSED_MESSAGE);

            verify(builders.constructed().getFirst(), never()).start();
        }
    }

    @Test
    void launcherRefusalOnAKernelWithoutLandlockFailsTheJob() throws Exception {
        ProcessExecutor.setCalibreSandboxMode(Mode.ON);
        try (MockedConstruction<ProcessBuilder> ignored =
                calibre(
                        CalibreSandboxPolicy.LAUNCHER_REFUSED_EXIT_CODE,
                        "calibre-sandbox: landlock unavailable, refusing to run\n")) {
            assertThatThrownBy(this::runCalibre)
                    .isInstanceOf(IOException.class)
                    .hasMessage(CalibreSandboxPolicy.REFUSED_MESSAGE);
        }
    }

    @Test
    void calibreExitingWithTheLauncherCodeIsAnOrdinaryFailure() throws Exception {
        ProcessExecutor.setCalibreSandboxMode(Mode.ON);
        try (MockedConstruction<ProcessBuilder> ignored =
                calibre(CalibreSandboxPolicy.LAUNCHER_REFUSED_EXIT_CODE, "Traceback\n")) {
            assertThatThrownBy(this::runCalibre)
                    .isInstanceOf(IOException.class)
                    .hasMessage("Calibre conversion failed with exit code 125");
        }
    }

    @Test
    void calibreErrorOutputIsNotPutInTheExceptionMessage() throws Exception {
        ProcessExecutor.setCalibreSandboxMode(Mode.ON);
        String stderr =
                "Could not find file missing.png in book\n"
                        + "Could not find file uuid-in-the-copy/"
                        + LEAKED_SECRET
                        + " in book\n";
        try (MockedConstruction<ProcessBuilder> ignored = calibre(134, stderr)) {
            assertThatThrownBy(this::runCalibre)
                    .isInstanceOf(IOException.class)
                    .hasMessage("Calibre conversion failed with exit code 134")
                    .message()
                    .doesNotContain(LEAKED_SECRET);
        }
    }
}
