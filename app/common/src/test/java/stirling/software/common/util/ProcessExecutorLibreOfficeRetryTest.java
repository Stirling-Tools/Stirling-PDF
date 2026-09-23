package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.MockedConstruction;
import org.mockito.Mockito;

import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;

class ProcessExecutorLibreOfficeRetryTest {

    @TempDir Path tmp;

    private Path profile;
    private List<String> command;

    private void prepareCommand() throws IOException {
        profile = tmp.resolve("libreoffice_profile_job");
        Path outDir = tmp.resolve("out");
        Path input = Files.writeString(tmp.resolve("in.docx"), "x");
        command =
                List.of(
                        "soffice",
                        "-env:UserInstallation=" + profile.toUri(),
                        "--headless",
                        "--convert-to",
                        "pdf",
                        "--outdir",
                        outDir.toString(),
                        input.toString());
    }

    private static Process process(boolean finished, int exitCode) throws InterruptedException {
        Process process = mock(Process.class);
        when(process.getInputStream()).thenReturn(new ByteArrayInputStream(new byte[0]));
        when(process.getErrorStream()).thenReturn(new ByteArrayInputStream(new byte[0]));
        when(process.waitFor(anyLong(), any(TimeUnit.class))).thenReturn(finished);
        when(process.exitValue()).thenReturn(exitCode);
        when(process.descendants()).thenReturn(Stream.empty());
        return process;
    }

    /**
     * Stands in for soffice: the first launch initialises the profile the way a real first start
     * does and then fails with the relaunch's exit code; later launches exit with {@code
     * laterExitCode}.
     */
    private MockedConstruction<ProcessBuilder> soffice(
            AtomicInteger launches, boolean firstFinishes, int laterExitCode) {
        return Mockito.mockConstruction(
                ProcessBuilder.class,
                (builder, context) -> {
                    when(builder.environment()).thenReturn(new HashMap<>());
                    when(builder.directory(any())).thenReturn(builder);
                    when(builder.start())
                            .thenAnswer(
                                    invocation -> {
                                        if (launches.getAndIncrement() == 0) {
                                            Files.createDirectories(profile.resolve("user"));
                                            return process(firstFinishes, 1);
                                        }
                                        return process(true, laterExitCode);
                                    });
                });
    }

    private ProcessExecutor libreOffice() {
        return ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE);
    }

    @Test
    void freshProfileIsRetriedOnceItHasBeenInitialised() throws Exception {
        prepareCommand();
        AtomicInteger launches = new AtomicInteger();

        try (MockedConstruction<ProcessBuilder> ignored = soffice(launches, true, 0)) {
            ProcessExecutorResult result = libreOffice().runCommandWithOutputHandling(command);

            assertThat(result.getRc()).isZero();
        }
        assertThat(launches).hasValue(2);
    }

    @Test
    void failureOnAnAlreadyInitialisedProfileIsNotRetried() throws Exception {
        prepareCommand();
        Files.createDirectories(profile.resolve("user"));
        AtomicInteger launches = new AtomicInteger();

        try (MockedConstruction<ProcessBuilder> ignored = soffice(launches, true, 0)) {
            assertThatThrownBy(() -> libreOffice().runCommandWithOutputHandling(command))
                    .isInstanceOf(IOException.class);
        }
        assertThat(launches).hasValue(1);
    }

    @Test
    void timedOutRunIsNotRetried() throws Exception {
        prepareCommand();
        AtomicInteger launches = new AtomicInteger();

        try (MockedConstruction<ProcessBuilder> ignored = soffice(launches, false, 0)) {
            assertThatThrownBy(() -> libreOffice().runCommandWithOutputHandling(command))
                    .isInstanceOf(IOException.class)
                    .hasMessageContaining("timeout");
        }
        assertThat(launches).hasValue(1);
    }
}
