package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
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

    private static final String FLAT_ODF_TEXT =
            "<?xml version=\"1.0\"?><office:document"
                    + " xmlns:office=\"urn:oasis:names:tc:opendocument:xmlns:office:1.0\""
                    + " office:mimetype=\"application/vnd.oasis.opendocument.text\">"
                    + "<office:body/></office:document>";

    private static ResponseEntity<Resource> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(new ByteArrayResource(bytes));
    }

    /** Writes the PDF soffice would have produced next to the staged input in --outdir. */
    private static ProcessExecutorResult writeSofficeOutput(
            List<String> command, ProcessExecutorResult result) throws IOException {
        Path inputPath = Path.of(command.getLast());
        String base = inputPath.getFileName().toString().replaceAll("\\.[^.]+$", "");
        Files.writeString(inputPath.getParent().resolve(base + ".pdf"), "%PDF-1.4 produced");
        return result;
    }

    private static byte[] zipBytes(String entryName) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            zos.putNextEntry(new ZipEntry(entryName));
            zos.write("<x/>".getBytes(StandardCharsets.UTF_8));
            zos.closeEntry();
        }
        return baos.toByteArray();
    }

    private static byte[] concat(byte[] first, byte[] second) {
        byte[] joined = Arrays.copyOf(first, first.length + second.length);
        System.arraycopy(second, 0, joined, first.length, second.length);
        return joined;
    }

    private MockMultipartFile docxFile(byte[] content) {
        return docxFile(content, "report.docx");
    }

    private MockMultipartFile docxFile(byte[] content, String filename) {
        return new MockMultipartFile(
                "fileInput",
                filename,
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
    @DisplayName("declared type allowlist")
    class ExtensionAllowlist {

        @ParameterizedTest
        @ValueSource(strings = {"docx", "odt", "fodt", "xml", "txt", "csv", "html", "png"})
        @DisplayName("an allowlisted extension is converted")
        void acceptedExtensionConverts(String extension) throws Exception {
            when(endpointConfiguration.isGroupEnabled("Unoconvert")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("Python")).thenReturn(false);
            when(customHtmlSanitizer.sanitize(anyString())).thenReturn("<html>clean</html>");
            when(officeDocumentSanitizer.isSanitizationEnabled()).thenReturn(true);
            when(officeDocumentSanitizer.sanitize(any(byte[].class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutorResult result = mockExecutor(pe, 0);
                ProcessExecutor executor = ProcessExecutor.getInstance(Processes.LIBRE_OFFICE);
                when(executor.runCommandWithOutputHandling(any(List.class)))
                        .thenAnswer(inv -> writeSofficeOutput(inv.getArgument(0), result));

                File pdf =
                        controller.convertToPdf(
                                new MockMultipartFile(
                                        "fileInput",
                                        "doc." + extension,
                                        "application/octet-stream",
                                        declaredContentFor(extension)));

                assertThat(pdf).exists();
                deleteWorkdir(pdf);
            }
        }

        /** Bytes that declare one of the candidates the extension allows. */
        private byte[] declaredContentFor(String extension) throws IOException {
            return switch (extension) {
                case "docx", "odt" -> zipBytes("content.xml");
                case "fodt", "xml" -> FLAT_ODF_TEXT.getBytes(StandardCharsets.UTF_8);
                default -> "<x>content</x>".getBytes(StandardCharsets.UTF_8);
            };
        }

        @ParameterizedTest
        @ValueSource(strings = {"dat", "exe", "toolongext", "pdf", "epub", "zip", "docx.exe"})
        @DisplayName("an extension outside the allowlist is rejected before LibreOffice is reached")
        void unknownExtensionIsRejected(String extension) {
            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                MockMultipartFile file =
                        new MockMultipartFile(
                                "fileInput",
                                "payload." + extension,
                                "application/octet-stream",
                                "x".getBytes(StandardCharsets.UTF_8));

                assertThatThrownBy(() -> controller.convertToPdf(file))
                        .isInstanceOf(IllegalArgumentException.class);

                pe.verifyNoInteractions();
            }
        }

        @Test
        @DisplayName("the rejection does not echo the extension it was given")
        void rejectionDoesNotReflectInput() {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput",
                            "payload.<script>",
                            "application/octet-stream",
                            "x".getBytes(StandardCharsets.UTF_8));

            assertThatThrownBy(() -> controller.convertToPdf(file))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageNotContaining("script");
        }

        @Test
        @DisplayName("the extension is matched case-insensitively")
        void extensionIsCaseInsensitive() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Unoconvert")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("Python")).thenReturn(false);
            when(officeDocumentSanitizer.isSanitizationEnabled()).thenReturn(true);
            when(officeDocumentSanitizer.sanitize(any(byte[].class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutorResult result = mockExecutor(pe, 0);
                ProcessExecutor executor = ProcessExecutor.getInstance(Processes.LIBRE_OFFICE);
                ArgumentCaptor<List<String>> cmd = ArgumentCaptor.forClass(List.class);
                when(executor.runCommandWithOutputHandling(cmd.capture()))
                        .thenAnswer(inv -> writeSofficeOutput(inv.getArgument(0), result));

                File pdf =
                        controller.convertToPdf(docxFile(zipBytes("word/document.xml"), "R.DOCX"));

                assertThat(cmd.getValue()).contains("--infilter=MS Word 2007 XML");
                deleteWorkdir(pdf);
            }
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
        @DisplayName("a name with no extension at all is rejected")
        void noExtension() {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput", "report", "application/octet-stream", "x".getBytes());
            assertThatThrownBy(() -> controller.convertToPdf(file))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Nested
    @DisplayName("forced import filter")
    class ForcedImportFilter {

        @Test
        @DisplayName("soffice is given --infilter for the declared type")
        void sofficeForcesFilter() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Unoconvert")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("Python")).thenReturn(false);
            when(officeDocumentSanitizer.isSanitizationEnabled()).thenReturn(true);
            when(officeDocumentSanitizer.sanitize(any(byte[].class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutorResult result = mockExecutor(pe, 0);
                ProcessExecutor executor = ProcessExecutor.getInstance(Processes.LIBRE_OFFICE);
                ArgumentCaptor<List<String>> cmd = ArgumentCaptor.forClass(List.class);
                when(executor.runCommandWithOutputHandling(cmd.capture()))
                        .thenAnswer(inv -> writeSofficeOutput(inv.getArgument(0), result));

                File pdf =
                        controller.convertToPdf(
                                new MockMultipartFile(
                                        "fileInput",
                                        "notes.odt",
                                        "application/octet-stream",
                                        zipBytes("content.xml")));

                List<String> command = cmd.getValue();
                assertThat(command).contains("--infilter=writer8");
                // A filter that arrived after --convert-to would be read as a positional input.
                assertThat(command.indexOf("--infilter=writer8"))
                        .isLessThan(command.indexOf("--convert-to"));

                deleteWorkdir(pdf);
            }
        }

        @Test
        @DisplayName("unoconvert is given --input-filter for the declared type")
        void unoconvertForcesFilter() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Unoconvert")).thenReturn(true);
            when(officeDocumentSanitizer.isSanitizationEnabled()).thenReturn(true);
            when(officeDocumentSanitizer.sanitize(any(byte[].class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutorResult result = mockExecutor(pe, 0);
                ProcessExecutor executor = ProcessExecutor.getInstance(Processes.LIBRE_OFFICE);
                ArgumentCaptor<List<String>> cmd = ArgumentCaptor.forClass(List.class);
                when(executor.runCommandWithOutputHandling(cmd.capture()))
                        .thenAnswer(
                                inv -> {
                                    List<String> command = inv.getArgument(0);
                                    Files.writeString(Path.of(command.getLast()), "%PDF-1.4");
                                    return result;
                                });

                File pdf = controller.convertToPdf(docxFile(zipBytes("word/document.xml")));

                List<String> command = cmd.getValue();
                assertThat(command).containsSequence("--input-filter", "MS Word 2007 XML");

                deleteWorkdir(pdf);
            }
        }

        @Test
        @DisplayName("a declared html upload is imported with the html filter")
        void htmlForcesHtmlFilter() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Unoconvert")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("Python")).thenReturn(false);
            when(customHtmlSanitizer.sanitize(anyString())).thenReturn("<html>clean</html>");

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutorResult result = mockExecutor(pe, 0);
                ProcessExecutor executor = ProcessExecutor.getInstance(Processes.LIBRE_OFFICE);
                ArgumentCaptor<List<String>> cmd = ArgumentCaptor.forClass(List.class);
                when(executor.runCommandWithOutputHandling(cmd.capture()))
                        .thenAnswer(inv -> writeSofficeOutput(inv.getArgument(0), result));

                File pdf =
                        controller.convertToPdf(
                                new MockMultipartFile(
                                        "fileInput",
                                        "page.html",
                                        "text/html",
                                        "<html><body>hi</body></html>"
                                                .getBytes(StandardCharsets.UTF_8)));

                assertThat(cmd.getValue()).contains("--infilter=HTML");
                deleteWorkdir(pdf);
            }
        }
    }

    @Nested
    @DisplayName("convertToPdf conversion paths")
    class ConversionPaths {

        @Test
        @DisplayName("uses unoconvert when available and returns produced pdf")
        void unoconvertSuccess() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Unoconvert")).thenReturn(true);
            when(officeDocumentSanitizer.isSanitizationEnabled()).thenReturn(true);
            when(officeDocumentSanitizer.sanitize(any(byte[].class)))
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
                                    Path out = Path.of(command.getLast());
                                    Files.writeString(out, "%PDF-1.4 produced");
                                    return result;
                                });

                File pdf = controller.convertToPdf(docxFile(zipBytes("word/document.xml")));

                assertThat(pdf).exists();
                assertThat(Files.size(pdf.toPath())).isGreaterThan(0L);
                assertThat(cmd.getValue().get(0)).isEqualTo("unoconvert");
                // sanitizer must have been consulted for the docx
                Mockito.verify(officeDocumentSanitizer).sanitize(any(byte[].class));

                deleteWorkdir(pdf);
            }
        }

        @Test
        @DisplayName("falls back to soffice when unoconvert is unavailable")
        void sofficeFallbackWhenUnoUnavailable() throws Exception {
            when(endpointConfiguration.isGroupEnabled("Unoconvert")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("Python")).thenReturn(false);
            when(officeDocumentSanitizer.isSanitizationEnabled()).thenReturn(true);
            when(officeDocumentSanitizer.sanitize(any(byte[].class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutorResult result = mockExecutor(pe, 0);
                ProcessExecutor executor = ProcessExecutor.getInstance(Processes.LIBRE_OFFICE);
                ArgumentCaptor<List<String>> cmd = ArgumentCaptor.forClass(List.class);
                when(executor.runCommandWithOutputHandling(cmd.capture()))
                        .thenAnswer(inv -> writeSofficeOutput(inv.getArgument(0), result));

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
            when(officeDocumentSanitizer.isSanitizationEnabled()).thenReturn(true);
            when(officeDocumentSanitizer.sanitize(any(byte[].class)))
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
            when(officeDocumentSanitizer.isSanitizationEnabled()).thenReturn(true);
            when(officeDocumentSanitizer.sanitize(any(byte[].class)))
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
            when(officeDocumentSanitizer.isSanitizationEnabled()).thenReturn(true);
            when(officeDocumentSanitizer.sanitize(any(byte[].class)))
                    .thenAnswer(inv -> inv.getArgument(0));

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutorResult result = mockExecutor(pe, 0);
                ProcessExecutor executor = ProcessExecutor.getInstance(Processes.LIBRE_OFFICE);
                when(executor.runCommandWithOutputHandling(any(List.class)))
                        .thenAnswer(
                                inv -> {
                                    List<String> command = inv.getArgument(0);
                                    Path inputPath = Path.of(command.getLast());
                                    Path out = inputPath.getParent().resolve("report.pdf");
                                    Files.write(out, new byte[0]);
                                    return result;
                                });

                assertThatThrownBy(() -> controller.convertToPdf(docxFile("docx".getBytes())))
                        .isInstanceOf(IllegalStateException.class)
                        .hasMessageContaining("empty");
            }
        }
    }

    @Nested
    @DisplayName("sanitizer routing by declared type")
    class SanitizerRouting {

        private MockMultipartFile upload(String filename, byte[] content) {
            return new MockMultipartFile(
                    "fileInput", filename, "application/octet-stream", content);
        }

        /** Runs a conversion, returning the bytes staged on disk for LibreOffice. */
        private byte[] stagedInput(MockMultipartFile file) throws Exception {
            when(endpointConfiguration.isGroupEnabled("Unoconvert")).thenReturn(false);
            when(endpointConfiguration.isGroupEnabled("Python")).thenReturn(false);
            byte[][] staged = new byte[1][];
            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                ProcessExecutorResult result = mockExecutor(pe, 0);
                ProcessExecutor executor = ProcessExecutor.getInstance(Processes.LIBRE_OFFICE);
                when(executor.runCommandWithOutputHandling(any(List.class)))
                        .thenAnswer(
                                inv -> {
                                    List<String> command = inv.getArgument(0);
                                    staged[0] = Files.readAllBytes(Path.of(command.getLast()));
                                    return writeSofficeOutput(command, result);
                                });
                File pdf = controller.convertToPdf(file);
                deleteWorkdir(pdf);
            }
            return staged[0];
        }

        @Test
        @DisplayName("a declared html upload goes to the html sanitizer only")
        void htmlGoesToHtmlSanitizer() throws Exception {
            when(customHtmlSanitizer.sanitize(anyString())).thenReturn("<html>clean</html>");

            byte[] staged =
                    stagedInput(
                            upload(
                                    "page.htm",
                                    "<html><img src=\"http://127.0.0.1/LEAK\"></html>"
                                            .getBytes(StandardCharsets.UTF_8)));

            assertThat(new String(staged, StandardCharsets.UTF_8)).isEqualTo("<html>clean</html>");
            Mockito.verifyNoInteractions(officeDocumentSanitizer);
        }

        @Test
        @DisplayName("markup uploaded as a non-html declared type never reaches the html sanitizer")
        void markupUnderAnOfficeExtensionIsNotTreatedAsHtml() throws Exception {
            when(officeDocumentSanitizer.isSanitizationEnabled()).thenReturn(true);
            when(officeDocumentSanitizer.sanitize(any(byte[].class)))
                    .thenAnswer(inv -> inv.getArgument(0));
            byte[] flatOdf =
                    "<office:document xmlns:office=\"urn:x\"><p>x</p></office:document>"
                            .getBytes(StandardCharsets.UTF_8);

            byte[] staged = stagedInput(upload("doc.fodt", flatOdf));

            assertThat(staged).isEqualTo(flatOdf);
            Mockito.verify(officeDocumentSanitizer).sanitize(any(byte[].class));
            Mockito.verifyNoInteractions(customHtmlSanitizer);
        }

        @ParameterizedTest(name = "leading run of {0} bytes")
        @ValueSource(ints = {0, 1, 8, 2048, 200_000})
        @DisplayName("html smuggled under an office extension is rejected, not converted")
        void smuggledHtmlIsRejected(int padding) throws Exception {
            when(officeDocumentSanitizer.isSanitizationEnabled()).thenReturn(true);
            when(officeDocumentSanitizer.sanitize(any(byte[].class)))
                    .thenThrow(new OfficeDocumentSanitizer.HtmlMarkupException());
            byte[] payload =
                    ("\f"
                                    + " ".repeat(padding)
                                    + "<table><tr><td><img"
                                    + " src=\"http://127.0.0.1:9920/LEAK\"></td></tr></table>")
                            .getBytes(StandardCharsets.UTF_8);

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                assertThatThrownBy(() -> controller.convertToPdf(upload("payload.fodt", payload)))
                        .isInstanceOf(IllegalArgumentException.class);

                pe.verifyNoInteractions();
            }
            Mockito.verifyNoInteractions(customHtmlSanitizer);
        }

        @Test
        @DisplayName("zip container with prepended bytes still reaches the office sanitizer")
        void prefixedZipIsSanitized() throws Exception {
            when(officeDocumentSanitizer.isSanitizationEnabled()).thenReturn(true);
            when(officeDocumentSanitizer.sanitize(any(byte[].class)))
                    .thenAnswer(inv -> inv.getArgument(0));
            byte[] prefixed = concat(new byte[100], zipBytes("content.xml"));

            stagedInput(upload("report.docx", prefixed));

            ArgumentCaptor<byte[]> seen = ArgumentCaptor.forClass(byte[].class);
            Mockito.verify(officeDocumentSanitizer).sanitize(seen.capture());
            assertThat(seen.getValue()).isEqualTo(prefixed);
        }

        @Test
        @DisplayName("a binary type with no sanitizer is streamed through untouched")
        void binaryInputIsNotBuffered() throws Exception {
            when(officeDocumentSanitizer.isSanitizationEnabled()).thenReturn(true);
            byte[] drawing =
                    new byte[] {(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, 0x1, 0x2, 0x3};

            assertThat(stagedInput(upload("legacy.vsd", drawing))).isEqualTo(drawing);
            Mockito.verify(officeDocumentSanitizer, Mockito.never()).sanitize(any(byte[].class));
        }

        @Test
        @DisplayName("a .doc whose bytes declare no Word generation never reaches LibreOffice")
        void undeclaredWordBinaryIsRejected() {
            byte[] notAWordDocument =
                    new byte[] {(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0, 0x1, 0x2, 0x3};

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                assertThatThrownBy(
                                () ->
                                        controller.convertToPdf(
                                                upload("legacy.doc", notAWordDocument)))
                        .isInstanceOf(IllegalArgumentException.class);

                pe.verifyNoInteractions();
            }
        }

        @ParameterizedTest
        @ValueSource(strings = {"notes.txt", "rows.csv", "data.json", "rows.slk", "rows.dif"})
        @DisplayName("a text type whose importer resolves nothing is left exactly as uploaded")
        void plainTextIsNotSanitized(String filename) throws Exception {
            when(officeDocumentSanitizer.isSanitizationEnabled()).thenReturn(true);
            byte[] text = "<not really markup, just text".getBytes(StandardCharsets.UTF_8);

            assertThat(stagedInput(upload(filename, text))).isEqualTo(text);
            Mockito.verifyNoInteractions(customHtmlSanitizer);
            Mockito.verify(officeDocumentSanitizer, Mockito.never()).sanitize(any(byte[].class));
        }

        @Test
        @DisplayName("markdown is rewritten, because its importer resolves what it references")
        void markdownIsSanitized() throws Exception {
            when(officeDocumentSanitizer.isSanitizationEnabled()).thenReturn(true);
            when(customHtmlSanitizer.sanitize(anyString())).thenReturn("");
            byte[] markdown =
                    ("KEEPME\n\n![x](http://127.0.0.1:1/LEAK)\n\n"
                                    + "<img src=\"http://127.0.0.1:1/RAW\">\n")
                            .getBytes(StandardCharsets.UTF_8);

            String staged =
                    new String(stagedInput(upload("readme.md", markdown)), StandardCharsets.UTF_8);

            assertThat(staged).contains("KEEPME");
            assertThat(staged).doesNotContain("127.0.0.1");
            Mockito.verify(officeDocumentSanitizer, Mockito.never()).sanitize(any(byte[].class));
        }

        @ParameterizedTest(name = "{0} in {1}")
        @CsvSource({
            "notes.md,windows-1252",
            "notes.md,ISO-8859-1",
            "page.html,windows-1252",
            "page.htm,ISO-8859-1"
        })
        @DisplayName("markup in a legacy encoding is decoded, not refused")
        void legacyEncodedMarkupIsDecoded(String filename, String charset) throws Exception {
            when(officeDocumentSanitizer.isSanitizationEnabled()).thenReturn(true);
            when(customHtmlSanitizer.sanitize(anyString())).thenAnswer(inv -> inv.getArgument(0));
            byte[] markup = "caf\u00e9 r\u00e9sum\u00e9\n".getBytes(Charset.forName(charset));

            byte[] staged = stagedInput(upload(filename, markup));

            assertThat(new String(staged, StandardCharsets.UTF_8))
                    .contains("caf\u00e9 r\u00e9sum\u00e9");
        }

        @ParameterizedTest(name = "{0}")
        @ValueSource(strings = {"UTF-16LE", "UTF-16BE", "UTF-8"})
        @DisplayName("a byte order mark says which encoding the markup is in")
        void markupWithAByteOrderMarkIsDecoded(String charset) throws Exception {
            when(officeDocumentSanitizer.isSanitizationEnabled()).thenReturn(true);
            byte[] mark =
                    switch (charset) {
                        case "UTF-16LE" -> new byte[] {(byte) 0xFF, (byte) 0xFE};
                        case "UTF-16BE" -> new byte[] {(byte) 0xFE, (byte) 0xFF};
                        default -> new byte[] {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};
                    };
            byte[] markup =
                    concat(mark, "caf\u00e9 r\u00e9sum\u00e9\n".getBytes(Charset.forName(charset)));

            byte[] staged = stagedInput(upload("notes.md", markup));

            assertThat(new String(staged, StandardCharsets.UTF_8))
                    .contains("caf\u00e9 r\u00e9sum\u00e9");
        }

        @Test
        @DisplayName("sanitization disabled leaves an office document untouched")
        void sanitizationDisabled() throws Exception {
            when(officeDocumentSanitizer.isSanitizationEnabled()).thenReturn(false);
            byte[] zip = zipBytes("content.xml");

            assertThat(stagedInput(upload("sheet.ods", zip))).isEqualTo(zip);
            Mockito.verify(officeDocumentSanitizer, Mockito.never()).sanitize(any(byte[].class));
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
            when(officeDocumentSanitizer.sanitize(any(byte[].class)))
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
                                    Path inputPath = Path.of(command.getLast());
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
            when(officeDocumentSanitizer.sanitize(any(byte[].class)))
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
