package stirling.software.common.util;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import stirling.software.common.model.ApplicationProperties;

/**
 * Gap-filling unit tests for {@link ProcessExecutor}. Focused on the pure logic that can be
 * exercised without launching any real OS process: command validation branches, the unoserver
 * endpoint helper methods (via reflection), the {@link ProcessExecutor.Processes} enum, the
 * singleton/getInstance behaviour, the static unoserver pool setter, and the nested {@link
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

    @SuppressWarnings("unchecked")
    private List<String> invokeStripUnoEndpointArgs(ProcessExecutor executor, List<String> command)
            throws Exception {
        Method method = ProcessExecutor.class.getDeclaredMethod("stripUnoEndpointArgs", List.class);
        method.setAccessible(true);
        return (List<String>) method.invoke(executor, command);
    }

    @SuppressWarnings("unchecked")
    private List<String> invokeApplyUnoServerEndpoint(
            ProcessExecutor executor,
            List<String> command,
            ApplicationProperties.ProcessExecutor.UnoServerEndpoint endpoint)
            throws Exception {
        Method method =
                ProcessExecutor.class.getDeclaredMethod(
                        "applyUnoServerEndpoint",
                        List.class,
                        ApplicationProperties.ProcessExecutor.UnoServerEndpoint.class);
        method.setAccessible(true);
        return (List<String>) method.invoke(executor, command, endpoint);
    }

    private boolean invokeShouldUseUnoServerPool(ProcessExecutor executor, List<String> command)
            throws Exception {
        Method method =
                ProcessExecutor.class.getDeclaredMethod("shouldUseUnoServerPool", List.class);
        method.setAccessible(true);
        return (boolean) method.invoke(executor, command);
    }

    private ProcessExecutor qpdfExecutor() {
        return ProcessExecutor.getInstance(ProcessExecutor.Processes.QPDF);
    }

    private ProcessExecutor libreOfficeExecutor() {
        return ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE);
    }

    /** The static unoserver pool is global state; clear it after every test that touches it. */
    @AfterEach
    void resetUnoServerPool() {
        ProcessExecutor.setUnoServerPool(null);
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

    // ----- stripUnoEndpointArgs ----------------------------------------------

    @Nested
    @DisplayName("stripUnoEndpointArgs")
    class StripUnoEndpointArgsTests {

        @Test
        @DisplayName("removes space-separated --host/--port/--host-location/--protocol pairs")
        void stripsSpaceSeparatedArgs() throws Exception {
            List<String> input =
                    List.of(
                            "unoconvert",
                            "--host",
                            "1.2.3.4",
                            "--port",
                            "9999",
                            "--host-location",
                            "remote",
                            "--protocol",
                            "https",
                            "in.docx",
                            "out.pdf");
            List<String> result = invokeStripUnoEndpointArgs(qpdfExecutor(), input);
            assertEquals(List.of("unoconvert", "in.docx", "out.pdf"), result);
        }

        @Test
        @DisplayName("removes equals-form --host=.../--port=... arguments")
        void stripsEqualsFormArgs() throws Exception {
            List<String> input =
                    List.of(
                            "unoconvert",
                            "--host=5.6.7.8",
                            "--port=4002",
                            "--host-location=local",
                            "--protocol=http",
                            "doc.odt");
            List<String> result = invokeStripUnoEndpointArgs(qpdfExecutor(), input);
            assertEquals(List.of("unoconvert", "doc.odt"), result);
        }

        @Test
        @DisplayName("leaves a command without endpoint args unchanged")
        void leavesPlainCommandUntouched() throws Exception {
            List<String> input = List.of("unoconvert", "in.docx", "out.pdf");
            List<String> result = invokeStripUnoEndpointArgs(qpdfExecutor(), input);
            assertEquals(input, result);
        }

        @Test
        @DisplayName("returns a fresh list, not the same instance")
        void returnsNewList() throws Exception {
            List<String> input = new ArrayList<>(List.of("unoconvert", "a", "b"));
            List<String> result = invokeStripUnoEndpointArgs(qpdfExecutor(), input);
            assertNotSame(input, result);
        }
    }

    // ----- applyUnoServerEndpoint --------------------------------------------

    private ApplicationProperties.ProcessExecutor.UnoServerEndpoint endpoint(
            String host, int port, String hostLocation, String protocol) {
        ApplicationProperties.ProcessExecutor.UnoServerEndpoint ep =
                new ApplicationProperties.ProcessExecutor.UnoServerEndpoint();
        ep.setHost(host);
        ep.setPort(port);
        ep.setHostLocation(hostLocation);
        ep.setProtocol(protocol);
        return ep;
    }

    @Nested
    @DisplayName("applyUnoServerEndpoint")
    class ApplyUnoServerEndpointTests {

        @Test
        @DisplayName(
                "injects --host/--port after the executable, defaults omit host-location and protocol")
        void injectsHostAndPortWithDefaults() throws Exception {
            List<String> command = List.of("unoconvert", "in.docx", "out.pdf");
            ApplicationProperties.ProcessExecutor.UnoServerEndpoint ep =
                    endpoint("9.9.9.9", 7777, "auto", "http");
            List<String> result = invokeApplyUnoServerEndpoint(qpdfExecutor(), command, ep);
            assertEquals(
                    List.of(
                            "unoconvert",
                            "--host",
                            "9.9.9.9",
                            "--port",
                            "7777",
                            "in.docx",
                            "out.pdf"),
                    result);
        }

        @Test
        @DisplayName("non-default host-location and protocol are injected")
        void injectsHostLocationAndProtocolWhenNonDefault() throws Exception {
            List<String> command = List.of("unoconvert", "in.docx");
            ApplicationProperties.ProcessExecutor.UnoServerEndpoint ep =
                    endpoint("10.0.0.5", 2200, "remote", "https");
            List<String> result = invokeApplyUnoServerEndpoint(qpdfExecutor(), command, ep);
            assertEquals(
                    List.of(
                            "unoconvert",
                            "--host",
                            "10.0.0.5",
                            "--port",
                            "2200",
                            "--host-location",
                            "remote",
                            "--protocol",
                            "https",
                            "in.docx"),
                    result);
        }

        @Test
        @DisplayName("blank host falls back to 127.0.0.1 and non-positive port falls back to 2003")
        void appliesHostAndPortFallbacks() throws Exception {
            List<String> command = List.of("unoconvert", "in.docx");
            ApplicationProperties.ProcessExecutor.UnoServerEndpoint ep =
                    endpoint("   ", 0, "auto", "http");
            List<String> result = invokeApplyUnoServerEndpoint(qpdfExecutor(), command, ep);
            assertEquals(
                    List.of("unoconvert", "--host", "127.0.0.1", "--port", "2003", "in.docx"),
                    result);
        }

        @Test
        @DisplayName("invalid host-location and protocol values are normalised to defaults")
        void invalidHostLocationAndProtocolNormalised() throws Exception {
            List<String> command = List.of("unoconvert", "in.docx");
            ApplicationProperties.ProcessExecutor.UnoServerEndpoint ep =
                    endpoint("1.1.1.1", 3000, "sideways", "gopher");
            List<String> result = invokeApplyUnoServerEndpoint(qpdfExecutor(), command, ep);
            // Both invalid -> normalised to defaults (auto/http) -> neither injected.
            assertEquals(
                    List.of("unoconvert", "--host", "1.1.1.1", "--port", "3000", "in.docx"),
                    result);
        }

        @Test
        @DisplayName("host-location and protocol matching is case-insensitive and trimmed")
        void hostLocationAndProtocolCaseInsensitive() throws Exception {
            List<String> command = List.of("unoconvert", "in.docx");
            ApplicationProperties.ProcessExecutor.UnoServerEndpoint ep =
                    endpoint("1.1.1.1", 3000, "  REMOTE ", " HTTPS ");
            List<String> result = invokeApplyUnoServerEndpoint(qpdfExecutor(), command, ep);
            assertEquals(
                    List.of(
                            "unoconvert",
                            "--host",
                            "1.1.1.1",
                            "--port",
                            "3000",
                            "--host-location",
                            "remote",
                            "--protocol",
                            "https",
                            "in.docx"),
                    result);
        }

        @Test
        @DisplayName("existing endpoint args are stripped before re-injection")
        void stripsExistingEndpointArgsBeforeInjecting() throws Exception {
            List<String> command = List.of("unoconvert", "--host", "old", "--port", "1", "in.docx");
            ApplicationProperties.ProcessExecutor.UnoServerEndpoint ep =
                    endpoint("2.2.2.2", 2222, "auto", "http");
            List<String> result = invokeApplyUnoServerEndpoint(qpdfExecutor(), command, ep);
            assertEquals(
                    List.of("unoconvert", "--host", "2.2.2.2", "--port", "2222", "in.docx"),
                    result);
        }

        @Test
        @DisplayName("null endpoint returns the command unchanged")
        void nullEndpointReturnsCommandUnchanged() throws Exception {
            List<String> command = List.of("unoconvert", "in.docx");
            List<String> result = invokeApplyUnoServerEndpoint(qpdfExecutor(), command, null);
            assertEquals(command, result);
        }

        @Test
        @DisplayName("empty command returns the command unchanged")
        void emptyCommandReturnedUnchanged() throws Exception {
            List<String> command = List.of();
            ApplicationProperties.ProcessExecutor.UnoServerEndpoint ep =
                    endpoint("1.1.1.1", 2003, "auto", "http");
            List<String> result = invokeApplyUnoServerEndpoint(qpdfExecutor(), command, ep);
            assertEquals(command, result);
        }
    }

    // ----- shouldUseUnoServerPool --------------------------------------------

    @Nested
    @DisplayName("shouldUseUnoServerPool")
    class ShouldUseUnoServerPoolTests {

        private UnoServerPool nonEmptyPool() {
            ApplicationProperties.ProcessExecutor.UnoServerEndpoint ep =
                    new ApplicationProperties.ProcessExecutor.UnoServerEndpoint();
            return new UnoServerPool(List.of(ep));
        }

        @Test
        @DisplayName(
                "false for non-LIBRE_OFFICE process type even with a pool and unoconvert command")
        void falseForNonLibreOfficeProcessType() throws Exception {
            ProcessExecutor.setUnoServerPool(nonEmptyPool());
            assertFalse(
                    invokeShouldUseUnoServerPool(qpdfExecutor(), List.of("unoconvert", "in.docx")));
        }

        @Test
        @DisplayName("false when no pool is configured")
        void falseWhenPoolNull() throws Exception {
            ProcessExecutor.setUnoServerPool(null);
            assertFalse(
                    invokeShouldUseUnoServerPool(
                            libreOfficeExecutor(), List.of("unoconvert", "in.docx")));
        }

        @Test
        @DisplayName("false when the configured pool is empty")
        void falseWhenPoolEmpty() throws Exception {
            ProcessExecutor.setUnoServerPool(new UnoServerPool(List.of()));
            assertFalse(
                    invokeShouldUseUnoServerPool(
                            libreOfficeExecutor(), List.of("unoconvert", "in.docx")));
        }

        @Test
        @DisplayName("false for null or empty command")
        void falseForNullOrEmptyCommand() throws Exception {
            ProcessExecutor.setUnoServerPool(nonEmptyPool());
            assertFalse(invokeShouldUseUnoServerPool(libreOfficeExecutor(), null));
            assertFalse(invokeShouldUseUnoServerPool(libreOfficeExecutor(), List.of()));
        }

        @Test
        @DisplayName("true for a plain unoconvert command with a non-empty pool")
        void trueForUnoconvertCommand() throws Exception {
            ProcessExecutor.setUnoServerPool(nonEmptyPool());
            assertTrue(
                    invokeShouldUseUnoServerPool(
                            libreOfficeExecutor(), List.of("unoconvert", "in.docx", "out.pdf")));
        }

        @Test
        @DisplayName("true for a unoconvert path with directories and a .exe extension")
        void trueForUnoconvertWithPathAndExeExtension() throws Exception {
            ProcessExecutor.setUnoServerPool(nonEmptyPool());
            assertTrue(
                    invokeShouldUseUnoServerPool(
                            libreOfficeExecutor(),
                            List.of("C:\\tools\\bin\\unoconvert.exe", "in.docx")));
            assertTrue(
                    invokeShouldUseUnoServerPool(
                            libreOfficeExecutor(),
                            List.of("/usr/local/bin/unoconvert", "in.docx")));
        }

        @Test
        @DisplayName("true for the legacy 'unoconv' executable name")
        void trueForLegacyUnoconv() throws Exception {
            ProcessExecutor.setUnoServerPool(nonEmptyPool());
            assertTrue(
                    invokeShouldUseUnoServerPool(
                            libreOfficeExecutor(), List.of("unoconv", "in.docx")));
        }

        @Test
        @DisplayName("false for soffice, which must not be routed through the pool")
        void falseForSoffice() throws Exception {
            ProcessExecutor.setUnoServerPool(nonEmptyPool());
            assertFalse(
                    invokeShouldUseUnoServerPool(
                            libreOfficeExecutor(),
                            List.of("/usr/bin/soffice", "--headless", "in.docx")));
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
            assertEquals(13, values.length);
            assertEquals(
                    ProcessExecutor.Processes.LIBRE_OFFICE,
                    ProcessExecutor.Processes.valueOf("LIBRE_OFFICE"));
            assertEquals(
                    ProcessExecutor.Processes.CFF_CONVERTER,
                    ProcessExecutor.Processes.valueOf("CFF_CONVERTER"));
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

    // ----- setUnoServerPool ---------------------------------------------------

    @Nested
    @DisplayName("setUnoServerPool")
    class SetUnoServerPoolTests {

        @Test
        @DisplayName("setting then clearing the pool flips shouldUseUnoServerPool")
        void poolSetterAffectsRouting() throws Exception {
            ProcessExecutor exec = libreOfficeExecutor();
            List<String> command = List.of("unoconvert", "in.docx");

            ProcessExecutor.setUnoServerPool(null);
            assertFalse(invokeShouldUseUnoServerPool(exec, command));

            ApplicationProperties.ProcessExecutor.UnoServerEndpoint ep =
                    new ApplicationProperties.ProcessExecutor.UnoServerEndpoint();
            ProcessExecutor.setUnoServerPool(new UnoServerPool(List.of(ep)));
            assertTrue(invokeShouldUseUnoServerPool(exec, command));

            ProcessExecutor.setUnoServerPool(null);
            assertFalse(invokeShouldUseUnoServerPool(exec, command));
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
