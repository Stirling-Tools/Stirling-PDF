package stirling.software.SPDF.util;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledOnOs;
import org.junit.jupiter.api.condition.OS;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.common.util.CheckProgramInstall;
import stirling.software.common.util.GeneralUtils;

@DisabledOnOs(OS.LINUX)
class CalibreSandboxScriptOffLinuxTest {

    @TempDir Path workDir;

    private String python;
    private Path launcher;

    @BeforeEach
    void requirePython() throws Exception {
        python = CheckProgramInstall.getAvailablePythonCommand();
        assumeTrue(python != null, "python is not installed");
        launcher = GeneralUtils.extractScript("calibre_sandbox.py").toAbsolutePath();
    }

    private record Run(int exitCode, String stderr, boolean commandRan) {}

    private Run launch() throws Exception {
        Path marker = workDir.resolve("ran");
        Files.deleteIfExists(marker);
        String job = "import pathlib, sys; pathlib.Path(sys.argv[1]).touch()";
        List<String> command =
                new ArrayList<>(List.of(python, "-I", launcher.toString(), workDir.toString()));
        command.addAll(List.of(python, "-I", "-c", job, marker.toString()));
        Path stderr = workDir.resolve("stderr");
        ProcessBuilder builder = new ProcessBuilder(command).directory(workDir.toFile());
        builder.redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(stderr.toFile());
        Process process = builder.start();
        if (!process.waitFor(60, TimeUnit.SECONDS)) {
            process.destroyForcibly();
            throw new IllegalStateException("launcher did not finish");
        }
        return new Run(
                process.exitValue(),
                Files.readString(stderr, StandardCharsets.UTF_8),
                Files.exists(marker));
    }

    @Test
    @DisplayName("refuses with the launcher's exit code and runs nothing")
    void refuses() throws Exception {
        Run run = launch();

        assertEquals(125, run.exitCode());
        assertTrue(run.stderr().startsWith("calibre-sandbox:"));
        assertFalse(run.commandRan());
    }
}
