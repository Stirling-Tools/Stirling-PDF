package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.converters.PdfToPdfARequest;
import stirling.software.SPDF.service.VeraPDFService;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.PdfaLevelAServiceInterface;
import stirling.software.common.util.ExceptionUtils;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

/**
 * Additional coverage for {@link ConvertPDFToPDFA} focusing on the end-to-end conversion flows
 * (handlePdfAConversion / handlePdfXConversion / convertPDDocumentToPDFA) and the Ghostscript
 * command builders. The external ghostscript/qpdf boundary is mocked with mockStatic, so no real
 * binary is ever executed.
 */
@DisplayName("ConvertPDFToPDFA additional flow tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ConvertPDFToPDFAMoreTest {

    @TempDir Path tempDir;

    @Mock private RuntimePathConfig runtimePathConfig;
    @Mock private VeraPDFService veraPDFService;
    @Mock private PdfaLevelAServiceInterface pdfaLevelAService;
    @Mock private TempFileManager tempFileManager;

    private ConvertPDFToPDFA newController() {
        return new ConvertPDFToPDFA(
                runtimePathConfig,
                veraPDFService,
                pdfaLevelAService,
                tempFileManager,
                new ApplicationProperties(),
                mock(stirling.software.SPDF.service.OfficeConversionService.class));
    }

    private static ResponseEntity<Resource> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(new ByteArrayResource(bytes));
    }

    // ---- reflection helpers ----------------------------------------------------------------

    @SuppressWarnings("unchecked")
    private <T> T invokeInstance(Object target, String methodName, Object... args)
            throws Exception {
        Method method = findMethod(methodName, args.length);
        method.setAccessible(true);
        try {
            return (T) method.invoke(target, args);
        } catch (InvocationTargetException e) {
            Throwable cause = e.getCause();
            if (cause instanceof Exception ex) {
                throw ex;
            }
            throw new RuntimeException(cause);
        }
    }

    private static Method findMethod(String methodName, int argCount) {
        for (Method method : ConvertPDFToPDFA.class.getDeclaredMethods()) {
            if (method.getName().equals(methodName) && method.getParameterCount() == argCount) {
                return method;
            }
        }
        throw new IllegalStateException(
                "No method " + methodName + " with " + argCount + " params");
    }

    private static Object resolvePdfaProfile(String token) throws Exception {
        Class<?> enumClass = null;
        for (Class<?> inner : ConvertPDFToPDFA.class.getDeclaredClasses()) {
            if (inner.getSimpleName().equals("PdfaProfile")) {
                enumClass = inner;
            }
        }
        Method m = enumClass.getDeclaredMethod("fromRequest", String.class);
        m.setAccessible(true);
        return m.invoke(null, token);
    }

    private static Object resolvePdfXProfile(String token) throws Exception {
        Class<?> enumClass = null;
        for (Class<?> inner : ConvertPDFToPDFA.class.getDeclaredClasses()) {
            if (inner.getSimpleName().equals("PdfXProfile")) {
                enumClass = inner;
            }
        }
        Method m = enumClass.getDeclaredMethod("fromRequest", String.class);
        m.setAccessible(true);
        return m.invoke(null, token);
    }

    // ---- pdf builders ----------------------------------------------------------------------

    private PDDocument simplePdf() throws IOException {
        PDDocument document = new PDDocument();
        PDPage page = new PDPage(PDRectangle.A4);
        document.addPage(page);
        try (PDPageContentStream cs = new PDPageContentStream(document, page)) {
            cs.beginText();
            cs.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            cs.newLineAtOffset(100, 700);
            cs.showText("hello world");
            cs.endText();
        }
        return document;
    }

    private byte[] simplePdfBytes() throws IOException {
        try (PDDocument document = simplePdf()) {
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            document.save(baos);
            return baos.toByteArray();
        }
    }

    private MockMultipartFile pdfFile() throws IOException {
        return new MockMultipartFile("fileInput", "input.pdf", "application/pdf", simplePdfBytes());
    }

    /**
     * Sets up a single ProcessExecutor mock returned for every Processes value. The command list
     * decides the result: ghostscript conversion commands write a valid output pdf, version/probe
     * commands return rc 0, everything else returns rc 0 without side effects.
     */
    private ProcessExecutor wireProcessExecutor(MockedStatic<ProcessExecutor> pe, int gsConvertRc)
            throws Exception {
        ProcessExecutor executor = Mockito.mock(ProcessExecutor.class);
        pe.when(() -> ProcessExecutor.getInstance(any(ProcessExecutor.Processes.class)))
                .thenReturn(executor);
        pe.when(
                        () ->
                                ProcessExecutor.getInstance(
                                        any(ProcessExecutor.Processes.class), Mockito.anyBoolean()))
                .thenReturn(executor);

        ProcessExecutorResult okResult = mock(ProcessExecutorResult.class);
        lenient().when(okResult.getRc()).thenReturn(0);

        ProcessExecutorResult gsResult = mock(ProcessExecutorResult.class);
        lenient().when(gsResult.getRc()).thenReturn(gsConvertRc);
        lenient().when(gsResult.getMessages()).thenReturn("gs output");

        lenient()
                .when(executor.runCommandWithOutputHandling(any(List.class)))
                .thenAnswer(
                        invocation -> {
                            List<String> command = invocation.getArgument(0);
                            // The real ghostscript conversion command contains -sOutputFile=...
                            String outFileArg =
                                    command.stream()
                                            .filter(a -> a.startsWith("-sOutputFile="))
                                            .findFirst()
                                            .orElse(null);
                            if (outFileArg != null) {
                                Path out = Path.of(outFileArg.substring("-sOutputFile=".length()));
                                if (gsConvertRc == 0) {
                                    Files.write(out, simplePdfBytes());
                                }
                                return gsResult;
                            }
                            // qpdf normalize/clean writes its (last-arg) output file
                            if (command.contains("--normalize-content=y")) {
                                // qpdf produced file is the last argument
                                Path out = Path.of(command.getLast());
                                Files.write(out, simplePdfBytes());
                            }
                            return okResult;
                        });
        return executor;
    }

    private TempFile managedTempFile() throws IOException {
        File f = Files.createTempFile(tempDir, "managed", ".pdf").toFile();
        TempFile tf = mock(TempFile.class);
        lenient().when(tf.getFile()).thenReturn(f);
        lenient().when(tf.getPath()).thenReturn(f.toPath());
        return tf;
    }

    @Nested
    @DisplayName("isGhostscriptAvailable")
    class GhostscriptAvailability {

        @Test
        @DisplayName("true when gs --version returns rc 0")
        void availableWhenRcZero() throws Exception {
            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                wireProcessExecutor(pe, 0);
                boolean available = invokeInstance(newController(), "isGhostscriptAvailable");
                assertThat(available).isTrue();
            }
        }

        @Test
        @DisplayName("false when probe throws")
        void unavailableWhenThrows() throws Exception {
            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutor executor = Mockito.mock(ProcessExecutor.class);
                pe.when(() -> ProcessExecutor.getInstance(any(ProcessExecutor.Processes.class)))
                        .thenReturn(executor);
                when(executor.runCommandWithOutputHandling(any(List.class)))
                        .thenThrow(new IOException("gs missing"));

                boolean available = invokeInstance(newController(), "isGhostscriptAvailable");
                assertThat(available).isFalse();
            }
        }
    }

    @Nested
    @DisplayName("handlePdfXConversion via pdfToPdfA endpoint")
    class PdfXConversion {

        @Test
        @DisplayName("Ghostscript success path returns the produced PDF/X file")
        void pdfXSuccess() throws Exception {
            TempFile managed = managedTempFile();
            when(tempFileManager.createManagedTempFile(anyString())).thenReturn(managed);

            PdfToPdfARequest request = new PdfToPdfARequest();
            request.setFileInput(pdfFile());
            request.setOutputFormat("pdfx");

            ResponseEntity<Resource> expected = streamingOk("ok".getBytes());

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {
                wireProcessExecutor(pe, 0);
                wr.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(expected);

                ResponseEntity<Resource> response = newController().pdfToPdfA(request);

                assertThat(response).isSameAs(expected);
                wr.verify(
                        () ->
                                WebResponseUtils.pdfFileToWebResponse(
                                        any(TempFile.class), eq("input.pdf")));
            }
        }

        @Test
        @DisplayName(
                "PDF/X with Ghostscript unavailable says the tool is missing, not that conversion failed")
        void pdfXNoGhostscript() throws Exception {
            PdfToPdfARequest request = new PdfToPdfARequest();
            request.setFileInput(pdfFile());
            request.setOutputFormat("pdfx");

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                // gs --version returns non-zero -> not available
                wireProcessExecutor(pe, 0);
                ProcessExecutor executor =
                        ProcessExecutor.getInstance(ProcessExecutor.Processes.GHOSTSCRIPT);
                ProcessExecutorResult notAvail = mock(ProcessExecutorResult.class);
                when(notAvail.getRc()).thenReturn(127);
                when(executor.runCommandWithOutputHandling(any(List.class))).thenReturn(notAvail);

                assertThatThrownBy(() -> newController().pdfToPdfA(request))
                        .isInstanceOf(ExceptionUtils.ToolRequiredException.class);
            }
        }
    }

    @Nested
    @DisplayName("Ghostscript command builders")
    class CommandBuilders {

        @Test
        @DisplayName("buildGhostscriptCommandX wires PDF/X version and image tuning")
        void buildsPdfXCommand() throws Exception {
            Path workingDir = Files.createDirectories(tempDir.resolve("gsx"));
            Path input = Files.write(workingDir.resolve("in.pdf"), simplePdfBytes());
            Path output = workingDir.resolve("out.pdf");
            Path rgb = Files.write(workingDir.resolve("rgb.icc"), new byte[] {1});
            Path gray = Files.write(workingDir.resolve("gray.icc"), new byte[] {1});

            Object colorProfiles = newColorProfiles(rgb, gray);
            Object profile = resolvePdfXProfile("pdfx");

            Method m =
                    ConvertPDFToPDFA.class.getDeclaredMethod(
                            "buildGhostscriptCommandX",
                            Path.class,
                            Path.class,
                            colorProfiles.getClass(),
                            Path.class,
                            profile.getClass());
            m.setAccessible(true);
            @SuppressWarnings("unchecked")
            List<String> command =
                    (List<String>)
                            m.invoke(null, input, output, colorProfiles, workingDir, profile);

            assertThat(command).contains("-dPDFX=2008", "-sDEVICE=pdfwrite");
            assertThat(command).anyMatch(a -> a.startsWith("-dColorImageResolution="));
        }

        @Test
        @DisplayName("prepareColorProfiles copies the sRGB icc and writes a gray profile")
        void preparesColorProfiles() throws Exception {
            Path workingDir = Files.createDirectories(tempDir.resolve("colors"));
            Object colorProfiles =
                    invokeInstance(newController(), "prepareColorProfiles", workingDir);
            assertThat(colorProfiles).isNotNull();

            Method rgbAccessor = colorProfiles.getClass().getDeclaredMethod("rgb");
            rgbAccessor.setAccessible(true);
            Path rgb = (Path) rgbAccessor.invoke(colorProfiles);
            assertThat(rgb).exists();
            assertThat(Files.size(rgb)).isGreaterThan(0L);
        }

        private Object newColorProfiles(Path rgb, Path gray) throws Exception {
            Class<?> recordClass = null;
            for (Class<?> inner : ConvertPDFToPDFA.class.getDeclaredClasses()) {
                if (inner.getSimpleName().equals("ColorProfiles")) {
                    recordClass = inner;
                }
            }
            var ctor = recordClass.getDeclaredConstructor(Path.class, Path.class);
            ctor.setAccessible(true);
            return ctor.newInstance(rgb, gray);
        }
    }
}
