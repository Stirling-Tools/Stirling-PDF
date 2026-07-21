package stirling.software.common.util;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.stream.Stream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.MockedConstruction;
import org.mockito.Mockito;

import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;

/**
 * Tests that drive {@link ProcessExecutor#runCommandWithOutputHandling} through its full
 * output-handling logic by intercepting {@link ProcessBuilder} construction with {@link
 * MockedConstruction}. The {@link Process} is mocked, so no real OS process is ever started.
 */
class ProcessExecutorMoreTest {

    private ProcessExecutor qpdfExecutor() {
        return ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF);
    }

    private ProcessExecutor ghostscriptExecutor() {
        return ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT);
    }

    /** Configure a mocked Process with given streams, completion flag and exit code. */
    private static Process mockedProcess(
            String stdout, String stderr, boolean finished, int exitCode)
            throws InterruptedException {
        Process process = mock(Process.class);
        when(process.getInputStream())
                .thenReturn(new ByteArrayInputStream(stdout.getBytes(StandardCharsets.UTF_8)));
        when(process.getErrorStream())
                .thenReturn(new ByteArrayInputStream(stderr.getBytes(StandardCharsets.UTF_8)));
        when(process.waitFor(anyLong(), any(TimeUnit.class))).thenReturn(finished);
        when(process.exitValue()).thenReturn(exitCode);
        when(process.descendants()).thenReturn(Stream.empty());
        return process;
    }

    /** Stub every constructed ProcessBuilder so start() returns the supplied process. */
    private MockedConstruction<ProcessBuilder> stubProcessBuilder(Process process) {
        return Mockito.mockConstruction(
                ProcessBuilder.class,
                (mockBuilder, context) -> {
                    when(mockBuilder.start()).thenReturn(process);
                    when(mockBuilder.directory(any())).thenReturn(mockBuilder);
                });
    }

    @Nested
    @DisplayName("runCommandWithOutputHandling - exit code handling")
    class ExitCodeTests {

        @Test
        @DisplayName("a successful command (exit 0) returns rc=0 and captured output")
        void successReturnsZero() throws Exception {
            Process process = mockedProcess("hello output", "", true, 0);
            try (MockedConstruction<ProcessBuilder> ignored = stubProcessBuilder(process)) {
                ProcessExecutorResult result =
                        qpdfExecutor().runCommandWithOutputHandling(List.of("qpdf", "--version"));
                assertThat(result.getRc()).isEqualTo(0);
                assertThat(result.getMessages()).contains("hello output");
            }
        }

        @Test
        @DisplayName("a non-zero exit code with error output throws an IOException")
        void nonZeroExitThrows() throws Exception {
            Process process = mockedProcess("", "fatal: boom", true, 2);
            try (MockedConstruction<ProcessBuilder> ignored = stubProcessBuilder(process)) {
                assertThatThrownBy(
                                () ->
                                        ghostscriptExecutor()
                                                .runCommandWithOutputHandling(
                                                        List.of("gs", "-bad")))
                        .isInstanceOf(IOException.class)
                        .hasMessageContaining("exit code 2");
            }
        }

        @Test
        @DisplayName("a non-zero exit code without error output still throws with the log tail")
        void nonZeroExitNoStderrThrows() throws Exception {
            Process process = mockedProcess("some stdout only", "", true, 5);
            try (MockedConstruction<ProcessBuilder> ignored = stubProcessBuilder(process)) {
                assertThatThrownBy(
                                () ->
                                        ghostscriptExecutor()
                                                .runCommandWithOutputHandling(List.of("gs", "x")))
                        .isInstanceOf(IOException.class)
                        .hasMessageContaining("exit code 5");
            }
        }
    }

    @Nested
    @DisplayName("runCommandWithOutputHandling - qpdf special-casing")
    class QpdfTests {

        @Test
        @DisplayName("qpdf exit code 3 is treated as success-with-warnings, not a failure")
        void qpdfExitThreeIsWarning() throws Exception {
            Process process = mockedProcess("", "WARNING: minor issue", true, 3);
            try (MockedConstruction<ProcessBuilder> ignored = stubProcessBuilder(process)) {
                ProcessExecutorResult result =
                        qpdfExecutor()
                                .runCommandWithOutputHandling(List.of("qpdf", "--check", "in.pdf"));
                assertThat(result.getRc()).isEqualTo(3);
            }
        }

        @Test
        @DisplayName("qpdf exit code 2 is still a hard failure")
        void qpdfExitTwoFails() throws Exception {
            Process process = mockedProcess("", "ERROR: broken", true, 2);
            try (MockedConstruction<ProcessBuilder> ignored = stubProcessBuilder(process)) {
                assertThatThrownBy(
                                () ->
                                        qpdfExecutor()
                                                .runCommandWithOutputHandling(
                                                        List.of("qpdf", "in.pdf")))
                        .isInstanceOf(IOException.class);
            }
        }
    }

    @Nested
    @DisplayName("runCommandWithOutputHandling - timeout")
    class TimeoutTests {

        @Test
        @DisplayName("a process that never finishes is destroyed and an IOException is thrown")
        void timeoutThrows() throws Exception {
            Process process = mockedProcess("", "", false, 0);
            try (MockedConstruction<ProcessBuilder> ignored = stubProcessBuilder(process)) {
                assertThatThrownBy(
                                () ->
                                        qpdfExecutor()
                                                .runCommandWithOutputHandling(
                                                        List.of("qpdf", "slow")))
                        .isInstanceOf(IOException.class)
                        .hasMessageContaining("timeout");
                Mockito.verify(process).destroyForcibly();
            }
        }
    }

    @Nested
    @DisplayName("runCommandWithOutputHandling - working directory overload")
    class WorkingDirectoryTests {

        @Test
        @DisplayName("the working-directory overload runs the command and applies the directory")
        void withWorkingDirectory() throws Exception {
            Process process = mockedProcess("ok", "", true, 0);
            try (MockedConstruction<ProcessBuilder> construction = stubProcessBuilder(process)) {
                ProcessExecutorResult result =
                        qpdfExecutor()
                                .runCommandWithOutputHandling(
                                        List.of("qpdf", "--version"),
                                        new java.io.File(System.getProperty("java.io.tmpdir")));
                assertThat(result.getRc()).isEqualTo(0);
                // directory(...) must have been applied to the single constructed builder.
                ProcessBuilder built = construction.constructed().get(0);
                Mockito.verify(built).directory(any(java.io.File.class));
            }
        }
    }
}
