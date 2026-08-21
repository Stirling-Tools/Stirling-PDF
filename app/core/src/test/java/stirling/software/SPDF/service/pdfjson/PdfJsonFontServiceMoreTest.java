package stirling.software.SPDF.service.pdfjson;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.io.File;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.util.Base64;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFileManager;

/**
 * Gap coverage for PdfJsonFontService - exercises loadConfiguration, isCommandAvailable,
 * buildPythonCommand, the method-dispatch branches and the Python / FontForge conversion bodies
 * (configured / unconfigured / rc!=0 / success) with a mocked ProcessExecutor.
 */
class PdfJsonFontServiceMoreTest {

    private TempFileManager tempFileManager;
    private ApplicationProperties applicationProperties;
    private PdfJsonFontService service;

    @BeforeEach
    void setUp() {
        tempFileManager = mock(TempFileManager.class);
        applicationProperties = mock(ApplicationProperties.class);
        service = new PdfJsonFontService(tempFileManager, applicationProperties);
    }

    private void setField(String name, Object value) throws Exception {
        Field f = PdfJsonFontService.class.getDeclaredField(name);
        f.setAccessible(true);
        f.set(service, value);
    }

    private Object invoke(String method, Class<?>[] sig, Object... args) throws Exception {
        Method m = PdfJsonFontService.class.getDeclaredMethod(method, sig);
        m.setAccessible(true);
        return m.invoke(service, args);
    }

    private void stubRealTempFiles() throws Exception {
        when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            String suffix = inv.getArgument(0);
                            File f = Files.createTempFile("fontsvc-test", suffix).toFile();
                            f.deleteOnExit();
                            return f;
                        });
    }

    @Nested
    @DisplayName("loadConfiguration / initialise")
    class Configuration {

        @Test
        @DisplayName("real enabled config populates fields and checks availability")
        void initialise_enabledConfig() throws Exception {
            ApplicationProperties props = new ApplicationProperties();
            // defaults: cffConverter.enabled = true, method = python
            PdfJsonFontService svc = new PdfJsonFontService(tempFileManager, props);

            Method m =
                    PdfJsonFontService.class.getDeclaredMethod(
                            "initialiseCffConverterAvailability");
            m.setAccessible(true);
            m.invoke(svc);

            assertTrue(svc.isCffConversionEnabled());
            assertEquals("python", svc.getCffConverterMethod());
        }

        @Test
        @DisplayName("disabled config short-circuits availability checks")
        void initialise_disabledConfig() throws Exception {
            ApplicationProperties props = new ApplicationProperties();
            props.getPdfEditor().getCffConverter().setEnabled(false);
            PdfJsonFontService svc = new PdfJsonFontService(tempFileManager, props);

            Method m =
                    PdfJsonFontService.class.getDeclaredMethod(
                            "initialiseCffConverterAvailability");
            m.setAccessible(true);
            m.invoke(svc);

            assertFalse(svc.isCffConversionEnabled());
        }

        @Test
        @DisplayName("null pdfEditor config disables CFF conversion")
        void loadConfiguration_nullPdfEditor() throws Exception {
            when(applicationProperties.getPdfEditor()).thenReturn(null);
            invoke("loadConfiguration", new Class<?>[] {});
            assertFalse(service.isCffConversionEnabled());
        }
    }

    @Nested
    @DisplayName("isCommandAvailable")
    class CommandAvailability {

        @Test
        @DisplayName("null or blank command returns false")
        void nullOrBlank_false() throws Exception {
            assertEquals(
                    false,
                    invoke("isCommandAvailable", new Class<?>[] {String.class}, (Object) null));
            assertEquals(false, invoke("isCommandAvailable", new Class<?>[] {String.class}, "  "));
        }

        @Test
        @DisplayName("non-existent command returns false")
        void nonExistent_false() throws Exception {
            assertEquals(
                    false,
                    invoke(
                            "isCommandAvailable",
                            new Class<?>[] {String.class},
                            "definitely-not-a-real-command-xyz123"));
        }
    }

    @Nested
    @DisplayName("buildPythonCommand")
    class BuildPythonCommand {

        @Test
        @DisplayName("without toUnicode produces 6-element command")
        void withoutToUnicode() throws Exception {
            setField("pythonCommand", "python3");
            setField("pythonScript", "/script.py");
            String[] cmd =
                    (String[])
                            invoke(
                                    "buildPythonCommand",
                                    new Class<?>[] {String.class, String.class, String.class},
                                    "in.cff",
                                    "out.otf",
                                    null);
            assertThat(cmd)
                    .containsExactly(
                            "python3", "/script.py", "--input", "in.cff", "--output", "out.otf");
        }

        @Test
        @DisplayName("with toUnicode appends --to-unicode")
        void withToUnicode() throws Exception {
            setField("pythonCommand", "python3");
            setField("pythonScript", "/script.py");
            String[] cmd =
                    (String[])
                            invoke(
                                    "buildPythonCommand",
                                    new Class<?>[] {String.class, String.class, String.class},
                                    "in.cff",
                                    "out.otf",
                                    "uni.txt");
            assertThat(cmd).contains("--to-unicode", "uni.txt");
            assertEquals(8, cmd.length);
        }
    }

    @Nested
    @DisplayName("convertCffProgramToTrueType dispatch")
    class Dispatch {

        @Test
        @DisplayName("python method, available, rc!=0 returns null")
        void pythonMethod_rcFailure() throws Exception {
            setField("cffConversionEnabled", true);
            setField("cffConverterMethod", "python");
            setField("pythonCffConverterAvailable", true);
            setField("pythonCommand", "python3");
            setField("pythonScript", "/script.py");
            stubRealTempFiles();

            try (MockedStatic<ProcessExecutor> mocked = mockStatic(ProcessExecutor.class)) {
                ProcessExecutor exec = mock(ProcessExecutor.class);
                ProcessExecutorResult result = mock(ProcessExecutorResult.class);
                when(result.getRc()).thenReturn(1);
                when(result.getMessages()).thenReturn("boom");
                when(exec.runCommandWithOutputHandling(anyList())).thenReturn(result);
                mocked.when(
                                () ->
                                        ProcessExecutor.getInstance(
                                                ProcessExecutor.Processes.CFF_CONVERTER))
                        .thenReturn(exec);

                assertNull(service.convertCffProgramToTrueType(new byte[] {1, 2, 3}, null));
            }
        }

        @Test
        @DisplayName("python method success returns produced bytes")
        void pythonMethod_success() throws Exception {
            setField("cffConversionEnabled", true);
            setField("cffConverterMethod", "python");
            setField("pythonCffConverterAvailable", true);
            setField("pythonCommand", "python3");
            setField("pythonScript", "/script.py");

            // Capture the .otf temp file so the mocked process can populate it.
            File[] otfHolder = new File[1];
            when(tempFileManager.createTempFile(anyString()))
                    .thenAnswer(
                            inv -> {
                                String suffix = inv.getArgument(0);
                                File f = Files.createTempFile("fontsvc-test", suffix).toFile();
                                f.deleteOnExit();
                                if (".otf".equals(suffix)) {
                                    otfHolder[0] = f;
                                }
                                return f;
                            });

            try (MockedStatic<ProcessExecutor> mocked = mockStatic(ProcessExecutor.class)) {
                ProcessExecutor exec = mock(ProcessExecutor.class);
                ProcessExecutorResult result = mock(ProcessExecutorResult.class);
                when(result.getRc()).thenReturn(0);
                when(exec.runCommandWithOutputHandling(anyList()))
                        .thenAnswer(
                                inv -> {
                                    Files.write(
                                            otfHolder[0].toPath(),
                                            new byte[] {
                                                (byte) 0x4F, (byte) 0x54, (byte) 0x54, (byte) 0x4F
                                            });
                                    return result;
                                });
                mocked.when(
                                () ->
                                        ProcessExecutor.getInstance(
                                                ProcessExecutor.Processes.CFF_CONVERTER))
                        .thenReturn(exec);

                byte[] out = service.convertCffProgramToTrueType(new byte[] {1, 2, 3}, null);
                assertNotNull(out);
                assertEquals(4, out.length);
            }
        }

        @Test
        @DisplayName("python conversion decodes toUnicode base64; invalid base64 returns null")
        void pythonMethod_invalidToUnicode() throws Exception {
            setField("cffConversionEnabled", true);
            setField("cffConverterMethod", "python");
            setField("pythonCffConverterAvailable", true);
            setField("pythonCommand", "python3");
            setField("pythonScript", "/script.py");
            stubRealTempFiles();

            // No ProcessExecutor mock needed: decode fails before exec is reached.
            byte[] out = service.convertCffProgramToTrueType(new byte[] {1, 2, 3}, "@@@notbase64");
            assertNull(out);
        }

        @Test
        @DisplayName("python conversion succeeds with valid toUnicode payload")
        void pythonMethod_validToUnicode() throws Exception {
            setField("cffConversionEnabled", true);
            setField("cffConverterMethod", "python");
            setField("pythonCffConverterAvailable", true);
            setField("pythonCommand", "python3");
            setField("pythonScript", "/script.py");

            File[] otfHolder = new File[1];
            when(tempFileManager.createTempFile(anyString()))
                    .thenAnswer(
                            inv -> {
                                String suffix = inv.getArgument(0);
                                File f = Files.createTempFile("fontsvc-test", suffix).toFile();
                                f.deleteOnExit();
                                if (".otf".equals(suffix)) {
                                    otfHolder[0] = f;
                                }
                                return f;
                            });

            String toUnicode = Base64.getEncoder().encodeToString(new byte[] {10, 20, 30});

            try (MockedStatic<ProcessExecutor> mocked = mockStatic(ProcessExecutor.class)) {
                ProcessExecutor exec = mock(ProcessExecutor.class);
                ProcessExecutorResult result = mock(ProcessExecutorResult.class);
                when(result.getRc()).thenReturn(0);
                when(exec.runCommandWithOutputHandling(anyList()))
                        .thenAnswer(
                                inv -> {
                                    Files.write(otfHolder[0].toPath(), new byte[] {1, 2, 3, 4, 5});
                                    return result;
                                });
                mocked.when(
                                () ->
                                        ProcessExecutor.getInstance(
                                                ProcessExecutor.Processes.CFF_CONVERTER))
                        .thenReturn(exec);

                byte[] out = service.convertCffProgramToTrueType(new byte[] {9, 9}, toUnicode);
                assertNotNull(out);
                assertEquals(5, out.length);
            }
        }

        @Test
        @DisplayName("fontforge method, available, rc!=0 returns null")
        void fontForgeMethod_rcFailure() throws Exception {
            setField("cffConversionEnabled", true);
            setField("cffConverterMethod", "fontforge");
            setField("fontForgeCffConverterAvailable", true);
            setField("fontforgeCommand", "fontforge");
            stubRealTempFiles();

            try (MockedStatic<ProcessExecutor> mocked = mockStatic(ProcessExecutor.class)) {
                ProcessExecutor exec = mock(ProcessExecutor.class);
                ProcessExecutorResult result = mock(ProcessExecutorResult.class);
                when(result.getRc()).thenReturn(2);
                when(exec.runCommandWithOutputHandling(anyList())).thenReturn(result);
                mocked.when(
                                () ->
                                        ProcessExecutor.getInstance(
                                                ProcessExecutor.Processes.CFF_CONVERTER))
                        .thenReturn(exec);

                assertNull(service.convertCffProgramToTrueType(new byte[] {1, 2, 3}, null));
            }
        }

        @Test
        @DisplayName("fontforge method success returns produced bytes")
        void fontForgeMethod_success() throws Exception {
            setField("cffConversionEnabled", true);
            setField("cffConverterMethod", "fontforge");
            setField("fontForgeCffConverterAvailable", true);
            setField("fontforgeCommand", "fontforge");

            File[] ttfHolder = new File[1];
            when(tempFileManager.createTempFile(anyString()))
                    .thenAnswer(
                            inv -> {
                                String suffix = inv.getArgument(0);
                                File f = Files.createTempFile("fontsvc-test", suffix).toFile();
                                f.deleteOnExit();
                                if (".ttf".equals(suffix)) {
                                    ttfHolder[0] = f;
                                }
                                return f;
                            });

            try (MockedStatic<ProcessExecutor> mocked = mockStatic(ProcessExecutor.class)) {
                ProcessExecutor exec = mock(ProcessExecutor.class);
                ProcessExecutorResult result = mock(ProcessExecutorResult.class);
                when(result.getRc()).thenReturn(0);
                when(exec.runCommandWithOutputHandling(anyList()))
                        .thenAnswer(
                                inv -> {
                                    Files.write(ttfHolder[0].toPath(), new byte[] {7, 7, 7});
                                    return result;
                                });
                mocked.when(
                                () ->
                                        ProcessExecutor.getInstance(
                                                ProcessExecutor.Processes.CFF_CONVERTER))
                        .thenReturn(exec);

                byte[] out = service.convertCffProgramToTrueType(new byte[] {1, 2, 3}, null);
                assertNotNull(out);
                assertEquals(3, out.length);
            }
        }
    }

    @Nested
    @DisplayName("convertCffUsingPython direct guards")
    class PythonGuards {

        @Test
        @DisplayName("not available returns null")
        void notAvailable() throws Exception {
            setField("pythonCffConverterAvailable", false);
            assertNull(
                    invoke(
                            "convertCffUsingPython",
                            new Class<?>[] {byte[].class, String.class},
                            new byte[] {1},
                            null));
        }

        @Test
        @DisplayName("blank command/script returns null")
        void notConfigured() throws Exception {
            setField("pythonCffConverterAvailable", true);
            setField("pythonCommand", "  ");
            setField("pythonScript", "");
            assertNull(
                    invoke(
                            "convertCffUsingPython",
                            new Class<?>[] {byte[].class, String.class},
                            new byte[] {1},
                            null));
        }
    }

    @Nested
    @DisplayName("convertCffUsingFontForge direct guard")
    class FontForgeGuard {

        @Test
        @DisplayName("not available returns null")
        void notAvailable() throws Exception {
            setField("fontForgeCffConverterAvailable", false);
            assertNull(service.convertCffUsingFontForge(new byte[] {1, 2, 3}));
        }

        @Test
        @DisplayName("rc==0 but no output file returns null")
        void noOutputFile() throws Exception {
            setField("fontForgeCffConverterAvailable", true);
            setField("fontforgeCommand", "fontforge");
            // createTempFile returns a file that we then delete so it does not exist.
            when(tempFileManager.createTempFile(anyString()))
                    .thenAnswer(
                            inv -> {
                                File f =
                                        Files.createTempFile("fontsvc-test", inv.getArgument(0))
                                                .toFile();
                                if (".ttf".equals(inv.getArgument(0))) {
                                    Files.deleteIfExists(f.toPath());
                                }
                                return f;
                            });

            try (MockedStatic<ProcessExecutor> mocked = mockStatic(ProcessExecutor.class)) {
                ProcessExecutor exec = mock(ProcessExecutor.class);
                ProcessExecutorResult result = mock(ProcessExecutorResult.class);
                when(result.getRc()).thenReturn(0);
                when(exec.runCommandWithOutputHandling(anyList())).thenReturn(result);
                mocked.when(
                                () ->
                                        ProcessExecutor.getInstance(
                                                ProcessExecutor.Processes.CFF_CONVERTER))
                        .thenReturn(exec);

                assertNull(service.convertCffUsingFontForge(new byte[] {1, 2, 3}));
            }
        }

        @Test
        @DisplayName("rc==0 but empty output file returns null")
        void emptyOutputFile() throws Exception {
            setField("fontForgeCffConverterAvailable", true);
            setField("fontforgeCommand", "fontforge");
            stubRealTempFiles(); // empty 0-byte temp files by default

            try (MockedStatic<ProcessExecutor> mocked = mockStatic(ProcessExecutor.class)) {
                ProcessExecutor exec = mock(ProcessExecutor.class);
                ProcessExecutorResult result = mock(ProcessExecutorResult.class);
                when(result.getRc()).thenReturn(0);
                when(exec.runCommandWithOutputHandling(anyList())).thenReturn(result);
                mocked.when(
                                () ->
                                        ProcessExecutor.getInstance(
                                                ProcessExecutor.Processes.CFF_CONVERTER))
                        .thenReturn(exec);

                assertNull(service.convertCffUsingFontForge(new byte[] {1, 2, 3}));
            }
        }
    }

    @Nested
    @DisplayName("detect* extra branches")
    class DetectExtra {

        @Test
        @DisplayName("detectFontFlavor recognises ttcf as cff and otf via OTTO")
        void detectFlavorExtra() {
            assertEquals("cff", service.detectFontFlavor(new byte[] {0x74, 0x74, 0x63, 0x66}));
            List<byte[]> otfVariants = List.of(new byte[] {0x4F, 0x54, 0x54, 0x4F});
            for (byte[] otf : otfVariants) {
                assertEquals("otf", service.detectFontFlavor(otf));
            }
        }
    }
}
