package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.File;
import java.io.IOException;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.junit.jupiter.api.BeforeEach;
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

import stirling.software.SPDF.service.OfficeToPdfService;
import stirling.software.common.model.api.GeneralFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.OfficeDocumentSanitizer;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.common.util.ZipBombGuard;

/** Unit tests for {@link ConvertOfficeController}; the in-process converter is mocked. */
@DisplayName("ConvertOfficeController tests")
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ConvertOfficeControllerTest {

    @TempDir Path tempDir;

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private OfficeDocumentSanitizer officeDocumentSanitizer;
    @Mock private TempFileManager tempFileManager;
    @Mock private OfficeToPdfService officeToPdfService;

    private ConvertOfficeController controller;

    @BeforeEach
    void setUp() {
        controller =
                new ConvertOfficeController(
                        pdfDocumentFactory,
                        officeDocumentSanitizer,
                        tempFileManager,
                        officeToPdfService);
    }

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

    private void writesPdf(String text) throws IOException {
        Mockito.doAnswer(
                        inv -> {
                            Files.writeString(inv.getArgument(1), text);
                            return null;
                        })
                .when(officeToPdfService)
                .convert(any(Path.class), any(Path.class));
    }

    private void sanitizerPassesThrough(String extension) throws IOException {
        when(officeDocumentSanitizer.isSanitizableExtension(extension)).thenReturn(true);
        when(officeDocumentSanitizer.sanitize(any(byte[].class), anyString()))
                .thenAnswer(inv -> inv.getArgument(0));
    }

    private static Set<Path> officeWorkDirs() throws IOException {
        try (var dirs =
                Files.newDirectoryStream(
                        Path.of(System.getProperty("java.io.tmpdir")), "office2pdf_*")) {
            Set<Path> found = new HashSet<>();
            dirs.forEach(found::add);
            return found;
        }
    }

    private static void deleteWorkdir(File producedPdf) throws IOException {
        if (producedPdf != null && producedPdf.getParentFile() != null) {
            org.apache.commons.io.FileUtils.deleteDirectory(producedPdf.getParentFile());
        }
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
        @DisplayName("invalid extension throws invalid-extension exception")
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

        @Test
        @DisplayName("a format the converter does not read is refused before any work")
        void unsupportedFormat() throws Exception {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput", "letter.wpd", "application/octet-stream", "x".getBytes());
            Set<Path> before = officeWorkDirs();

            assertThatThrownBy(() -> controller.convertToPdf(file))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("wpd");
            Mockito.verify(officeToPdfService, Mockito.never())
                    .convert(any(Path.class), any(Path.class));
            assertThat(officeWorkDirs()).isEqualTo(before);
        }
    }

    @Nested
    @DisplayName("Stirling Office Convert")
    class InProcess {

        @Test
        @DisplayName("converts after sanitizing, without starting any process")
        void convertsInProcess() throws Exception {
            sanitizerPassesThrough("docx");
            writesPdf("%PDF in process");

            try (MockedStatic<ProcessExecutor> pe = Mockito.mockStatic(ProcessExecutor.class)) {
                File pdf = controller.convertToPdf(docxFile("real-docx".getBytes()));

                assertThat(Files.readString(pdf.toPath())).isEqualTo("%PDF in process");
                pe.verifyNoInteractions();
                Mockito.verify(officeDocumentSanitizer).sanitize(any(byte[].class), anyString());
                deleteWorkdir(pdf);
            }
        }

        @Test
        @DisplayName("a file the sanitizer refuses never reaches the converter")
        void refusedBySanitizer() throws Exception {
            when(officeDocumentSanitizer.isSanitizableExtension("docx")).thenReturn(true);
            when(officeDocumentSanitizer.sanitize(any(byte[].class), anyString()))
                    .thenThrow(new ZipBombGuard.ZipBombException("too big"));
            Set<Path> before = officeWorkDirs();

            assertThatThrownBy(() -> controller.convertToPdf(docxFile("x".getBytes())))
                    .isInstanceOf(ZipBombGuard.ZipBombException.class);
            Mockito.verify(officeToPdfService, Mockito.never())
                    .convert(any(Path.class), any(Path.class));
            assertThat(officeWorkDirs()).isEqualTo(before);
        }

        @Test
        @DisplayName("an unchecked failure before conversion leaves no work dir")
        void uncheckedFailureLeavesNoWorkDir() throws Exception {
            when(officeDocumentSanitizer.isSanitizableExtension("docx")).thenReturn(true);
            when(officeDocumentSanitizer.sanitize(any(byte[].class), anyString()))
                    .thenThrow(new SecurityException("unsafe entry"));
            Set<Path> before = officeWorkDirs();

            assertThatThrownBy(() -> controller.convertToPdf(docxFile("x".getBytes())))
                    .isInstanceOf(SecurityException.class);

            assertThat(officeWorkDirs()).isEqualTo(before);
        }

        @Test
        @DisplayName("a converter failure propagates and leaves no work dir")
        void converterFailurePropagates() throws Exception {
            sanitizerPassesThrough("docx");
            Mockito.doThrow(new IOException("unreadable"))
                    .when(officeToPdfService)
                    .convert(any(Path.class), any(Path.class));
            Set<Path> before = officeWorkDirs();

            assertThatThrownBy(() -> controller.convertToPdf(docxFile("x".getBytes())))
                    .isInstanceOf(IOException.class)
                    .hasMessage("unreadable");

            assertThat(officeWorkDirs()).isEqualTo(before);
        }
    }

    @Nested
    @DisplayName("processFileToPDF endpoint")
    class EndpointTests {

        @Test
        @DisplayName("happy path loads, saves and cleans up the work directory")
        void happyPath() throws Exception {
            sanitizerPassesThrough("docx");
            writesPdf("%PDF produced");

            File tempOutFile = Files.createTempFile(tempDir, "out", ".pdf").toFile();
            TempFile tempOut = mock(TempFile.class);
            when(tempOut.getFile()).thenReturn(tempOutFile);
            when(tempFileManager.createManagedTempFile(anyString())).thenReturn(tempOut);

            PDDocument doc = new PDDocument();
            doc.addPage(new PDPage());
            when(pdfDocumentFactory.load(any(File.class))).thenReturn(doc);

            GeneralFile generalFile = new GeneralFile();
            generalFile.setFileInput(docxFile("docx-bytes".getBytes()));

            ResponseEntity<Resource> expected =
                    ResponseEntity.ok(new ByteArrayResource(new byte[0]));
            Set<Path> before = officeWorkDirs();

            try (MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class);
                    MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class)) {
                gu.when(() -> GeneralUtils.generateFilename("report.docx", ".pdf"))
                        .thenReturn("report.pdf");
                wr.when(
                                () ->
                                        WebResponseUtils.pdfFileToWebResponse(
                                                any(TempFile.class), eq("report.pdf")))
                        .thenReturn(expected);

                ResponseEntity<Resource> response = controller.processFileToPDF(generalFile);

                assertThat(response).isSameAs(expected);
            }

            assertThat(officeWorkDirs()).isEqualTo(before);
            doc.close();
        }

        @Test
        @DisplayName("conversion failure propagates and does not return a response")
        void conversionFailurePropagates() throws Exception {
            sanitizerPassesThrough("docx");
            Mockito.doThrow(new IOException("broken"))
                    .when(officeToPdfService)
                    .convert(any(Path.class), any(Path.class));

            GeneralFile generalFile = new GeneralFile();
            generalFile.setFileInput(docxFile("docx".getBytes()));

            assertThatThrownBy(() -> controller.processFileToPDF(generalFile))
                    .isInstanceOf(IOException.class);
            Mockito.verifyNoInteractions(pdfDocumentFactory);
        }
    }

    @Nested
    @DisplayName("Legacy binary Office files")
    class LegacyBinary {

        private static final byte[] OLE2 = {
            (byte) 0xD0,
            (byte) 0xCF,
            0x11,
            (byte) 0xE0,
            (byte) 0xA1,
            (byte) 0xB1,
            0x1A,
            (byte) 0xE1,
            0,
            0,
            0,
            0
        };

        @Test
        @DisplayName("a renamed OLE2 file is copied as-is, skipping the ZIP sanitizer")
        void ole2SkipsSanitizer() throws Exception {
            when(officeDocumentSanitizer.isSanitizableExtension("xlsx")).thenReturn(true);
            MockMultipartFile renamed =
                    new MockMultipartFile("fileInput", "book.xlsx", "application/msword", OLE2);
            Mockito.doAnswer(
                            inv -> {
                                Path in = inv.getArgument(0);
                                assertThat(Files.readAllBytes(in)).isEqualTo(OLE2);
                                Files.writeString(inv.getArgument(1), "%PDF in process");
                                return null;
                            })
                    .when(officeToPdfService)
                    .convert(any(Path.class), any(Path.class));

            File pdf = controller.convertToPdf(renamed);

            assertThat(Files.readString(pdf.toPath())).isEqualTo("%PDF in process");
            Mockito.verify(officeDocumentSanitizer, Mockito.never())
                    .sanitize(any(byte[].class), anyString());
            deleteWorkdir(pdf);
        }

        @Test
        @DisplayName("an OLE2 .doc converts in process")
        void ole2ConvertsInProcess() throws Exception {
            writesPdf("%PDF in process");

            File pdf =
                    controller.convertToPdf(
                            new MockMultipartFile(
                                    "fileInput", "report.doc", "application/msword", OLE2));

            assertThat(Files.readString(pdf.toPath())).isEqualTo("%PDF in process");
            deleteWorkdir(pdf);
        }
    }
}
