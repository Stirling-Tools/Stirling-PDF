package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * Gap-filling unit tests for {@link ProcessExecutor}. Focused on the pure logic that can be
 * exercised without launching any real OS process: command validation branches, the {@link
 * ProcessExecutor.Processes} enum, the singleton/getInstance behaviour, and the nested {@link
 * ProcessExecutor.ProcessExecutorResult} value type.
 */
class ProcessExecutorGapTest {

    // ----- reflection helpers -------------------------------------------------

    private void invokeValidateCommand(ProcessExecutor executor, List<String> command)
            throws Exception {
        Method method = ProcessExecutor.class.getDeclaredMethod("validateCommand", List.class);
        method.setAccessible(true);
        try {
            method.invoke(executor, command);
        } catch (InvocationTargetException e) {
            throw (Exception) e.getCause();
        }
    }

    private ProcessExecutor qpdfExecutor() {
        return ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF);
    }

    // ----- validateCommand deeper branches -----------------------------------

    @Nested
    @DisplayName("validateCommand path/executable branches")
    class ValidateCommandPathTests {

        @Test
        @DisplayName("absolute path executable that does not exist is rejected")
        void absolutePathExecutableMissing() {
            String bogus =
                    System.getProperty("os.name").toLowerCase().contains("win")
                            ? "C:\\definitely\\does\\not\\exist\\tool.exe"
                            : "/definitely/does/not/exist/tool";
            IllegalArgumentException ex =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> invokeValidateCommand(qpdfExecutor(), List.of(bogus)));
            assertTrue(ex.getMessage().contains("does not exist"));
        }

        @Test
        @DisplayName("path that exists but is a directory is rejected (not a regular file)")
        void directoryPathExecutableRejected(@TempDir Path tempDir) {
            String dirPath = tempDir.toString();
            // Ensure the path contains a separator so the path-based validation branch is taken.
            assertTrue(dirPath.contains("/") || dirPath.contains("\\"));
            IllegalArgumentException ex =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> invokeValidateCommand(qpdfExecutor(), List.of(dirPath)));
            assertTrue(ex.getMessage().contains("not a regular file"));
        }

        @Test
        @DisplayName("absolute path to an existing regular file passes validation")
        void existingRegularFileExecutablePasses(@TempDir Path tempDir) throws Exception {
            Path file = tempDir.resolve("fakebinary");
            Files.writeString(file, "#!/bin/sh\n");
            assertTrue(Files.exists(file));
            // Should not throw.
            invokeValidateCommand(qpdfExecutor(), List.of(file.toString(), "--version"));
        }

        @Test
        @DisplayName("path traversal anywhere in the executable is rejected")
        void pathTraversalInExecutable() {
            IllegalArgumentException ex =
                    assertThrows(
                            IllegalArgumentException.class,
                            () ->
                                    invokeValidateCommand(
                                            qpdfExecutor(), List.of("/usr/bin/../bin/tool")));
            assertTrue(ex.getMessage().contains("path traversal"));
        }

        @Test
        @DisplayName("null byte / newline checks run across every argument, not just the first")
        void invalidCharactersInLaterArgument() {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> invokeValidateCommand(qpdfExecutor(), List.of("qpdf", "ok", "bad\0arg")));
            assertThrows(
                    IllegalArgumentException.class,
                    () -> invokeValidateCommand(qpdfExecutor(), List.of("qpdf", "ok", "bad\narg")));
            assertThrows(
                    IllegalArgumentException.class,
                    () -> invokeValidateCommand(qpdfExecutor(), List.of("qpdf", "ok", "bad\rarg")));
        }

        @Test
        @DisplayName("relative simple command (no separators) is trusted and passes")
        void relativeSimpleCommandPasses() throws Exception {
            invokeValidateCommand(qpdfExecutor(), List.of("qpdf", "--help"));
        }

        @Test
        @DisplayName("null first-argument executable is rejected")
        void nullExecutableRejected() {
            List<String> command = new ArrayList<>();
            command.add(null);
            // null arg is caught by the per-arg null check before the executable check.
            assertThrows(
                    IllegalArgumentException.class,
                    () -> invokeValidateCommand(qpdfExecutor(), command));
        }
    }

    // ----- Processes enum -----------------------------------------------------

    @Nested
    @DisplayName("Processes enum")
    class ProcessesEnumTests {

        @Test
        @DisplayName("contains all expected process types")
        void containsExpectedValues() {
            ProcessExecutor.Processes[] values = ProcessExecutor.Processes.values();
            assertEquals(7, values.length);
            assertEquals(
                    ProcessExecutor.Processes.FFMPEG, ProcessExecutor.Processes.valueOf("FFMPEG"));
        }

        @Test
        @DisplayName("valueOf rejects an unknown name")
        void valueOfRejectsUnknown() {
            assertThrows(
                    IllegalArgumentException.class,
                    () -> ProcessExecutor.Processes.valueOf("NOT_A_PROCESS"));
        }

        @Test
        @DisplayName("getInstance resolves a non-null singleton for every enum value")
        void getInstanceForEveryProcessType() {
            for (ProcessExecutor.Processes p : ProcessExecutor.Processes.values()) {
                ProcessExecutor instance = ProcessExecutor.getInstance(p);
                assertNotNull(instance, "instance should not be null for " + p);
                // Same key returns the cached singleton.
                assertSame(instance, ProcessExecutor.getInstance(p));
            }
        }
    }

    // ----- getInstance / liveUpdates -----------------------------------------

    @Nested
    @DisplayName("getInstance behaviour")
    class GetInstanceTests {

        @Test
        @DisplayName("single-arg getInstance delegates to liveUpdates=true and is cached")
        void singleArgDelegatesAndCaches() {
            ProcessExecutor a = ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT);
            ProcessExecutor b =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT, true);
            assertSame(a, b);
        }

        @Test
        @DisplayName("the liveUpdates flag of the first call wins because the instance is cached")
        void firstCallWinsForCachedInstance() {
            // First resolution for this type fixes its configuration.
            ProcessExecutor first =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.OCR_MY_PDF, false);
            ProcessExecutor second =
                    ProcessExecutor.getInstance(ProcessExecutor.Processes.OCR_MY_PDF, true);
            assertSame(first, second);
        }
    }

    // ----- ProcessExecutorResult ---------------------------------------------

    @Nested
    @DisplayName("ProcessExecutorResult value type")
    class ProcessExecutorResultTests {

        @Test
        @DisplayName("constructor stores rc and messages; setters mutate them")
        void constructorAndSetters() {
            ProcessExecutor exec = qpdfExecutor();
            ProcessExecutor.ProcessExecutorResult result = exec.new ProcessExecutorResult(0, "ok");
            assertEquals(0, result.getRc());
            assertEquals("ok", result.getMessages());

            result.setRc(42);
            result.setMessages("boom");
            assertEquals(42, result.getRc());
            assertEquals("boom", result.getMessages());
        }

        @Test
        @DisplayName("messages may be null")
        void allowsNullMessages() {
            ProcessExecutor exec = qpdfExecutor();
            ProcessExecutor.ProcessExecutorResult result = exec.new ProcessExecutorResult(3, null);
            assertEquals(3, result.getRc());
            assertNull(result.getMessages());
        }
    }

    // ----- runCommandWithOutputHandling validation entry point ---------------

    @Nested
    @DisplayName("runCommandWithOutputHandling validation (no process launched)")
    class RunCommandValidationTests {

        @Test
        @DisplayName("empty command is rejected before any process is started")
        void emptyCommandRejected() {
            ProcessExecutor exec = qpdfExecutor();
            assertThrows(
                    IllegalArgumentException.class,
                    () -> exec.runCommandWithOutputHandling(List.of()));
        }

        @Test
        @DisplayName("command containing a null byte is rejected before any process is started")
        void nullByteCommandRejected() {
            ProcessExecutor exec = qpdfExecutor();
            assertThrows(
                    IllegalArgumentException.class,
                    () -> exec.runCommandWithOutputHandling(List.of("qpdf", "bad\0arg")));
        }

        @Test
        @DisplayName("absolute non-existent executable is rejected before any process is started")
        void missingAbsoluteExecutableRejected() {
            ProcessExecutor exec = qpdfExecutor();
            String bogus =
                    System.getProperty("os.name").toLowerCase().contains("win")
                            ? "C:\\no\\such\\tool.exe"
                            : "/no/such/tool";
            IllegalArgumentException ex =
                    assertThrows(
                            IllegalArgumentException.class,
                            () -> exec.runCommandWithOutputHandling(List.of(bogus)));
            assertTrue(ex.getMessage().contains("does not exist"));
        }

        @Test
        @DisplayName("validation exception type is not an IOException for bad input")
        void validationThrowsIllegalArgumentNotIOException() {
            ProcessExecutor exec = qpdfExecutor();
            Exception thrown =
                    assertThrows(
                            Exception.class,
                            () -> exec.runCommandWithOutputHandling(List.of("qpdf", "x\ny")));
            assertInstanceOf(IllegalArgumentException.class, thrown);
            assertFalse(thrown instanceof IOException);
        }
    }
}
