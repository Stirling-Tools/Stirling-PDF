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
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.MockedConstruction;
import org.mockito.MockedStatic;
import org.mockito.Mockito;

import stirling.software.common.util.CalibreSandboxPolicy.Mode;

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
    void sandboxEnforcesByDefaultWhereItIsExpected() {
        assertThat(CalibreSandboxPolicy.resolveMode(null, true)).isEqualTo(Mode.ENFORCE);
        assertThat(CalibreSandboxPolicy.resolveMode(" ", true)).isEqualTo(Mode.ENFORCE);
        assertThat(CalibreSandboxPolicy.resolveMode(null, false)).isEqualTo(Mode.UNSUPPORTED);
    }

    @Test
    void configuredModeIsHonouredAndUnknownValuesEnforce() {
        assertThat(CalibreSandboxPolicy.resolveMode("off", true)).isEqualTo(Mode.OFF);
        assertThat(CalibreSandboxPolicy.resolveMode("ENFORCE", true)).isEqualTo(Mode.ENFORCE);
        assertThat(CalibreSandboxPolicy.resolveMode("required", false)).isEqualTo(Mode.REQUIRED);
        assertThat(CalibreSandboxPolicy.resolveMode("disabled", true)).isEqualTo(Mode.ENFORCE);
    }

    @Test
    void commandIsWrappedInTheLauncherAndConfinedToTheWorkingDirectory() throws IOException {
        for (Mode mode : List.of(Mode.ENFORCE, Mode.REQUIRED)) {
            assertThat(
                            CalibreSandboxPolicy.confine(
                                    mode, command, workDir.toFile(), new HashMap<>()))
                    .isEqualTo(confinedCommand);
        }
    }

    @Test
    void unconfinedModesLeaveTheCommandAlone() throws IOException {
        for (Mode mode : List.of(Mode.OFF, Mode.UNSUPPORTED)) {
            assertThat(
                            CalibreSandboxPolicy.confine(
                                    mode, command, workDir.toFile(), new HashMap<>()))
                    .isEqualTo(command);
        }
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

        CalibreSandboxPolicy.confine(Mode.REQUIRED, command, workDir.toFile(), env);

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
                        Map.entry("QTWEBENGINE_CHROMIUM_FLAGS", "--disable-gpu"),
                        Map.entry(CalibreSandboxPolicy.MODE_VARIABLE, "required"));
        assertThat(Path.of(home)).isDirectory();
    }

    @Test
    void aJobWithoutAWorkingDirectoryIsRefused() {
        assertThatThrownBy(
                        () ->
                                CalibreSandboxPolicy.confine(
                                        Mode.REQUIRED, command, null, new HashMap<>()))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("working directory");
    }

    @Test
    void withoutPythonARequiredSandboxRefusesToRunCalibre() {
        checkProgramInstall.when(CheckProgramInstall::getAvailablePythonCommand).thenReturn(null);

        assertThatThrownBy(
                        () ->
                                CalibreSandboxPolicy.confine(
                                        Mode.REQUIRED, command, workDir.toFile(), new HashMap<>()))
                .isInstanceOf(IOException.class)
                .hasMessage(CalibreSandboxPolicy.REFUSED_MESSAGE);
    }

    @Test
    void withoutPythonAnEnforcedSandboxRunsCalibreUnconfined() throws IOException {
        checkProgramInstall.when(CheckProgramInstall::getAvailablePythonCommand).thenReturn(null);

        assertThat(
                        CalibreSandboxPolicy.confine(
                                Mode.ENFORCE, command, workDir.toFile(), new HashMap<>()))
                .isEqualTo(command);
    }

    private static MockedConstruction<ProcessBuilder> calibre(int exitCode, String stderr) {
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
                    when(process.waitFor(anyLong(), any(TimeUnit.class))).thenReturn(true);
                    when(process.exitValue()).thenReturn(exitCode);
                    when(builder.environment()).thenReturn(new HashMap<>());
                    when(builder.start()).thenReturn(process);
                });
    }

    private void runCalibre() throws Exception {
        ProcessExecutor.getInstance(ProcessExecutor.Processes.CALIBRE)
                .runCommandWithOutputHandling(command, workDir.toFile());
    }

    @Test
    void processExecutorLaunchesCalibreConfined() throws Exception {
        ProcessExecutor.setCalibreSandboxMode(Mode.REQUIRED);
        try (MockedConstruction<ProcessBuilder> builders = calibre(0, "")) {
            runCalibre();

            verify(builders.constructed().getFirst()).command(confinedCommand);
        }
    }

    @Test
    void bareInstallLaunchesCalibreUnchanged() throws Exception {
        ProcessExecutor.setCalibreSandboxMode(Mode.UNSUPPORTED);
        try (MockedConstruction<ProcessBuilder> builders = calibre(0, "")) {
            runCalibre();

            verify(builders.constructed().getFirst()).command(command);
        }
    }

    @Test
    void processExecutorDoesNotStartCalibreWhenTheRequiredSandboxNeedsMissingPython()
            throws Exception {
        ProcessExecutor.setCalibreSandboxMode(Mode.REQUIRED);
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
        ProcessExecutor.setCalibreSandboxMode(Mode.REQUIRED);
        try (MockedConstruction<ProcessBuilder> ignored =
                calibre(
                        CalibreSandboxPolicy.LAUNCHER_REFUSED_EXIT_CODE,
                        "calibre-sandbox: landlock unavailable, filesystem unconfined\n")) {
            assertThatThrownBy(this::runCalibre)
                    .isInstanceOf(IOException.class)
                    .hasMessage(CalibreSandboxPolicy.REFUSED_MESSAGE);
        }
    }

    @Test
    void partialConfinementUnderEnforceStillConverts() throws Exception {
        ProcessExecutor.setCalibreSandboxMode(Mode.ENFORCE);
        try (MockedConstruction<ProcessBuilder> ignored =
                calibre(0, "calibre-sandbox: seccomp unavailable, network unconfined\n")) {
            runCalibre();
        }
    }

    @Test
    void calibreErrorOutputIsNotPutInTheExceptionMessage() throws Exception {
        ProcessExecutor.setCalibreSandboxMode(Mode.REQUIRED);
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
