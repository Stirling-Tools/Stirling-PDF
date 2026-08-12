package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;
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

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.api.GeneralFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.CustomHtmlSanitizer;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.OfficeDocumentSanitizer;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.ProcessExecutor.Processes;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

/**
 * Unit tests for {@link ConvertOfficeController}. The external LibreOffice/unoconvert boundary is
 * mocked via mockStatic(ProcessExecutor) so no real process is spawned.
 */
@DisplayName("ConvertOfficeController tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ConvertOfficeControllerTest {

    @TempDir Path tempDir;

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private RuntimePathConfig runtimePathConfig;
    @Mock private CustomHtmlSanitizer customHtmlSanitizer;
    @Mock private OfficeDocumentSanitizer officeDocumentSanitizer;
    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private TempFileManager tempFileManager;

    private ConvertOfficeController controller;

    private ConvertOfficeController newController() {
        return new ConvertOfficeController(
                pdfDocumentFactory,
                runtimePathConfig,
                customHtmlSanitizer,
                officeDocumentSanitizer,
                endpointConfiguration,
                tempFileManager);
    }

    @BeforeEach
    void setUp() {
        controller = newController();
        lenient().when(runtimePathConfig.getSOfficePath()).thenReturn("soffice");
        lenient().when(runtimePathConfig.getUnoConvertPath()).thenReturn("unoconvert");
    }

    private static ResponseEntity<Resource> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(new ByteArrayResource(bytes));
    }

    // ---- reflection helper for the private convertToPdf-supporting methods --------------------

    @SuppressWarnings("unchecked")
    private <T> T invokeInstance(String methodName, Object... args) throws Exception {
        for (Method method : ConvertOfficeController.class.getDeclaredMethods()) {
            if (method.getName().equals(methodName) && method.getParameterCount() == args.length) {
                method.setAccessible(true);
                try {
                    return (T) method.invoke(controller, args);
                } catch (InvocationTargetException e) {
                    Throwable cause = e.getCause();
                    if (cause instanceof Exception ex) {
                        throw ex;
                    }
                    throw new RuntimeException(cause);
                }
            }
        }
        throw new IllegalStateException(
                "No method " + methodName + " with " + args.length + " args");
    }

    private MockMultipartFile docxFile(byte[] content) {
        return new MockMultipartFile(
                "fileInput",
                "report.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                content);
    }

    /**
     * Configures the static ProcessExecutor so the LibreOffice/uno call returns rc and writes a pdf
     * to the outdir if requested.
     */
    private ProcessExecutorResult mockExecutor(MockedStatic<ProcessExecutor> pe, int rc) {
        ProcessExecutor executor = Mockito.mock(ProcessExecutor.class);
        pe.when(() -> ProcessExecutor.getInstance(Processes.LIBRE_OFFICE)).thenReturn(executor);
        ProcessExecutorResult result = Mockito.mock(ProcessExecutorResult.class);
        when(result.getRc()).thenReturn(rc);
        return result;
    }

    @Nested
    @DisplayName("isValidFileExtension")
    class ExtensionValidation {

        @Test
        @DisplayName("accepts 2-4 char alphanumeric extensions")
        void acceptsValid() throws Exception {
            assertThat((boolean) invokeInstance("isValidFileExtension", "docx")).isTrue();
            assertThat((boolean) invokeInstance("isValidFileExtension", "odt")).isTrue();
            assertThat((boolean) invokeInstance("isValidFileExtension", "xls")).isTrue();
        }

        @Test
        @DisplayName("rejects too-long or symbol extensions")
        void rejectsInvalid() throws Exception {
            assertThat((boolean) invokeInstance("isValidFileExtension", "toolongext")).isFalse();
            assertThat((boolean) invokeInstance("isValidFileExtension", "a")).isFalse();
            assertThat((boolean) invokeInstance("isValidFileExtension", "d.x")).isFalse();
        }
    }

    @Nested
    @DisplayName("convertToPdf input validation")
    class InputValidation {

        @Test
        @DisplayName("blank filename throws file-no-name exception")
        void blankFilename() {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput", "", "application/octet-stream", "x".getBytes());
            assertThatThrownBy(() -> controller.convertToPdf(file))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("unsupported/invalid extension throws invalid-extension exception")
        void invalidExtension() {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput",
                            "archive.toolong",
                            "application/octet-stream",
                            "x".getBytes());
            assertThatThrownBy(() -> controller.convertToPdf(file))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Nested
    @DisplayName("convertToPdf conversion paths")
    class ConversionPaths {

        @Test
        @DisplayName("uses unoconvert when available and returns produced pdf")
        void unoconvertSuccess() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Unoconvert")).thenReturn(true);
            when(officeDocumentSanitizer.isSanitizableExtension("docx")).thenReturn(true);
            when(officeDocumentSanitizer.sanitize(any(byte[].class), anyString()))
                    .thenAnswer(inv -> inv.getArgument(0));

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutorResult result = mockExecutor(pe, 0);
                ProcessExecutor executor = ProcessExecutor.getInstance(Processes.LIBRE_OFFICE);
                ArgumentCaptor<List<String>> cmd = ArgumentCaptor.forClass(List.class);
                when(executor.runCommandWithOutputHandling(cmd.capture()))
                        .thenAnswer(
                                inv -> {
                                    // unoconvert writes directly to the output path (last arg)
                                    List<String> command = inv.getArgument(0);
                                    Path out = Path.of(command.get(command.size() - 1));
                                    Files.writeString(out, "%PDF-1.4 produced");
                                    return result;
                                });

                File pdf = controller.convertToPdf(docxFile("real-docx".getBytes()));

                assertThat(pdf).exists();
                assertThat(Files.size(pdf.toPath())).isGreaterThan(0L);
                assertThat(cmd.getValue().get(0)).isEqualTo("unoconvert");
                // sanitizer must have been consulted for the docx
                Mockito.verify(officeDocumentSanitizer).sanitize(any(byte[].class), anyString());

                deleteWorkdir(pdf);
            }
        }

        @Test
        @DisplayName("falls back to soffice when unoconvert is unavailable")
        void sofficeFallbackWhenUnoUnavailable() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Unoconvert")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("Python")).thenReturn(false);
            when(officeDocumentSanitizer.isSanitizableExtension("docx")).thenReturn(true);
            when(officeDocumentSanitizer.sanitize(any(byte[].class), anyString()))
                    .thenAnswer(inv -> inv.getArgument(0));

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutorResult result = mockExecutor(pe, 0);
                ProcessExecutor executor = ProcessExecutor.getInstance(Processes.LIBRE_OFFICE);
                ArgumentCaptor<List<String>> cmd = ArgumentCaptor.forClass(List.class);
                when(executor.runCommandWithOutputHandling(cmd.capture()))
                        .thenAnswer(
                                inv -> {
                                    // soffice writes <basename>.pdf into the --outdir (workDir)
                                    List<String> command = inv.getArgument(0);
                                    Path inputPath = Path.of(command.get(command.size() - 1));
                                    Path out = inputPath.getParent().resolve("report.pdf");
                                    Files.writeString(out, "%PDF soffice");
                                    return result;
                                });

                File pdf = controller.convertToPdf(docxFile("real-docx".getBytes()));

                assertThat(pdf).exists();
                assertThat(cmd.getValue().get(0)).isEqualTo("soffice");
                assertThat(cmd.getValue()).contains("--headless", "--convert-to", "pdf");

                deleteWorkdir(pdf);
            }
        }

        @Test
        @DisplayName("non-zero exit code throws IllegalStateException")
        void nonZeroExit() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Unoconvert")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("Python")).thenReturn(false);
            when(officeDocumentSanitizer.isSanitizableExtension("docx")).thenReturn(true);
            when(officeDocumentSanitizer.sanitize(any(byte[].class), anyString()))
                    .thenAnswer(inv -> inv.getArgument(0));

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutorResult result = mockExecutor(pe, 3);
                ProcessExecutor executor = ProcessExecutor.getInstance(Processes.LIBRE_OFFICE);
                when(executor.runCommandWithOutputHandling(any(List.class))).thenReturn(result);

                assertThatThrownBy(() -> controller.convertToPdf(docxFile("docx".getBytes())))
                        .isInstanceOf(IllegalStateException.class)
                        .hasMessageContaining("exit 3");
            }
        }

        @Test
        @DisplayName("no produced pdf (rc 0 but no file) throws IllegalStateException")
        void noProducedPdf() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Unoconvert")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("Python")).thenReturn(false);
            when(officeDocumentSanitizer.isSanitizableExtension("docx")).thenReturn(true);
            when(officeDocumentSanitizer.sanitize(any(byte[].class), anyString()))
                    .thenAnswer(inv -> inv.getArgument(0));

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutorResult result = mockExecutor(pe, 0);
                ProcessExecutor executor = ProcessExecutor.getInstance(Processes.LIBRE_OFFICE);
                // rc 0 but nothing written to workDir -> "No PDF produced."
                when(executor.runCommandWithOutputHandling(any(List.class))).thenReturn(result);

                assertThatThrownBy(() -> controller.convertToPdf(docxFile("docx".getBytes())))
                        .isInstanceOf(IllegalStateException.class);
            }
        }

        @Test
        @DisplayName("empty produced pdf throws IllegalStateException")
        void emptyProducedPdf() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Unoconvert")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("Python")).thenReturn(false);
            when(officeDocumentSanitizer.isSanitizableExtension("docx")).thenReturn(true);
            when(officeDocumentSanitizer.sanitize(any(byte[].class), anyString()))
                    .thenAnswer(inv -> inv.getArgument(0));

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutorResult result = mockExecutor(pe, 0);
                ProcessExecutor executor = ProcessExecutor.getInstance(Processes.LIBRE_OFFICE);
                when(executor.runCommandWithOutputHandling(any(List.class)))
                        .thenAnswer(
                                inv -> {
                                    List<String> command = inv.getArgument(0);
                                    Path inputPath = Path.of(command.get(command.size() - 1));
                                    Path out = inputPath.getParent().resolve("report.pdf");
                                    Files.write(out, new byte[0]);
                                    return result;
                                });

                assertThatThrownBy(() -> controller.convertToPdf(docxFile("docx".getBytes())))
                        .isInstanceOf(IllegalStateException.class)
                        .hasMessageContaining("empty");
            }
        }

        @Test
        @DisplayName("html input is routed through the html sanitizer")
        void htmlSanitized() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Unoconvert")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("Python")).thenReturn(false);
            when(customHtmlSanitizer.sanitize(anyString())).thenReturn("<html>clean</html>");

            MockMultipartFile html =
                    new MockMultipartFile(
                            "fileInput",
                            "page.html",
                            "text/html",
                            "<html><body>hi</body></html>".getBytes(StandardCharsets.UTF_8));

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutorResult result = mockExecutor(pe, 0);
                ProcessExecutor executor = ProcessExecutor.getInstance(Processes.LIBRE_OFFICE);
                when(executor.runCommandWithOutputHandling(any(List.class)))
                        .thenAnswer(
                                inv -> {
                                    List<String> command = inv.getArgument(0);
                                    Path inputPath = Path.of(command.get(command.size() - 1));
                                    Path out = inputPath.getParent().resolve("page.pdf");
                                    Files.writeString(out, "%PDF html");
                                    return result;
                                });

                File pdf = controller.convertToPdf(html);

                assertThat(pdf).exists();
                Mockito.verify(customHtmlSanitizer).sanitize(anyString());
                Mockito.verifyNoInteractions(officeDocumentSanitizer);

                deleteWorkdir(pdf);
            }
        }
    }

    @Nested
    @DisplayName("processFileToPDF endpoint")
    class EndpointTests {

        @Test
        @DisplayName("happy path loads, saves and cleans up the work directory")
        void happyPath() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Unoconvert")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("Python")).thenReturn(false);
            when(officeDocumentSanitizer.isSanitizableExtension("docx")).thenReturn(true);
            when(officeDocumentSanitizer.sanitize(any(byte[].class), anyString()))
                    .thenAnswer(inv -> inv.getArgument(0));

            File tempOutFile = Files.createTempFile(tempDir, "out", ".pdf").toFile();
            TempFile tempOut = mock(TempFile.class);
            when(tempOut.getFile()).thenReturn(tempOutFile);
            when(tempFileManager.createManagedTempFile(anyString())).thenReturn(tempOut);

            PDDocument doc = new PDDocument();
            doc.addPage(new PDPage());
            when(pdfDocumentFactory.load(any(File.class))).thenReturn(doc);

            GeneralFile generalFile = new GeneralFile();
            generalFile.setFileInput(docxFile("docx-bytes".getBytes()));

            ResponseEntity<Resource> expected = streamingOk("pdf".getBytes());

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class);
                    MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class);
                    MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {

                ProcessExecutorResult result = mockExecutor(pe, 0);
                ProcessExecutor executor = ProcessExecutor.getInstance(Processes.LIBRE_OFFICE);
                when(executor.runCommandWithOutputHandling(any(List.class)))
                        .thenAnswer(
                                inv -> {
                                    List<String> command = inv.getArgument(0);
                                    Path inputPath = Path.of(command.get(command.size() - 1));
                                    Path out = inputPath.getParent().resolve("report.pdf");
                                    Files.writeString(out, "%PDF produced");
                                    return result;
                                });

                gu.when(() -> GeneralUtils.generateFilename(anyString(), anyString()))
                        .thenReturn("report_convertedToPDF.pdf");
                wr.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                any(TempFile.class), anyString()))
                        .thenReturn(expected);

                ResponseEntity<Resource> response = controller.processFileToPDF(generalFile);

                assertThat(response).isSameAs(expected);
                wr.verify(
                        () ->
                                WebResponseUtils.pdfFileToWebResponse(
                                        any(TempFile.class), anyString()));
            }

            doc.close();
        }

        @Test
        @DisplayName("conversion failure propagates and does not return a response")
        void conversionFailurePropagates() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Unoconvert")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("Python")).thenReturn(false);
            when(officeDocumentSanitizer.isSanitizableExtension("docx")).thenReturn(true);
            when(officeDocumentSanitizer.sanitize(any(byte[].class), anyString()))
                    .thenAnswer(inv -> inv.getArgument(0));

            GeneralFile generalFile = new GeneralFile();
            generalFile.setFileInput(docxFile("docx".getBytes()));

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutorResult result = mockExecutor(pe, 1);
                ProcessExecutor executor = ProcessExecutor.getInstance(Processes.LIBRE_OFFICE);
                when(executor.runCommandWithOutputHandling(any(List.class))).thenReturn(result);

                assertThatThrownBy(() -> controller.processFileToPDF(generalFile))
                        .isInstanceOf(IllegalStateException.class);

                // a failed conversion never reaches the document factory
                Mockito.verifyNoInteractions(pdfDocumentFactory);
            }
        }
    }

    private static void deleteWorkdir(File producedPdf) throws IOException {
        if (producedPdf != null && producedPdf.getParentFile() != null) {
            org.apache.commons.io.FileUtils.deleteDirectory(producedPdf.getParentFile());
        }
    }
}
