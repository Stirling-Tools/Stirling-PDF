package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
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
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.converters.PdfToPresentationRequest;
import stirling.software.SPDF.model.api.converters.PdfToTextOrRTFRequest;
import stirling.software.SPDF.model.api.converters.PdfToWordRequest;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

/**
 * Additional tests for {@link ConvertPDFToOffice}. The office-format conversions delegate to {@code
 * PDFToFile.processPdfToOfficeFormat}, which shells out to LibreOffice through the static {@link
 * ProcessExecutor} factory. Here that factory is mocked with {@code mockStatic}; the mocked
 * command-runner writes the expected output file into the LibreOffice {@code --outdir} so the real
 * {@code PDFToFile} flow completes and a file-backed response is produced. No real LibreOffice
 * runs.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ConvertPDFToOfficeMoreTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @Mock private RuntimePathConfig runtimePathConfig;

    @InjectMocks private ConvertPDFToOffice controller;

    @BeforeEach
    void setUp() throws Exception {
        // Real temp files backing TempFileManager so the file-backed response can be read back.
        lenient()
                .when(tempFileManager.createManagedTempFile(any()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("conv-out", inv.<String>getArgument(0))
                                            .toFile();
                            f.deleteOnExit();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });

        // PDFToFile creates its own TempFile(manager, suffix) which calls manager.createTempFile.
        lenient()
                .when(tempFileManager.createTempFile(any()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("conv-in", inv.<String>getArgument(0))
                                            .toFile();
                            f.deleteOnExit();
                            return f;
                        });

        // PDFToFile also creates a TempDirectory for LibreOffice output.
        lenient()
                .when(tempFileManager.createTempDirectory())
                .thenAnswer(inv -> Files.createTempDirectory("conv-dir"));

        // Force the soffice fallback path (uno disabled) and a deterministic soffice binary name.
        lenient().when(runtimePathConfig.getUnoConvertPath()).thenReturn("");
        lenient().when(runtimePathConfig.getSOfficePath()).thenReturn("soffice");
    }

    private MockMultipartFile pdfFile() {
        return new MockMultipartFile(
                "fileInput",
                "document.pdf",
                MediaType.APPLICATION_PDF_VALUE,
                "%PDF-1.4".getBytes());
    }

    private MockMultipartFile nonPdfFile() {
        return new MockMultipartFile(
                "fileInput", "document.txt", MediaType.TEXT_PLAIN_VALUE, "hello".getBytes());
    }

    private static byte[] readResource(Resource resource) throws IOException {
        try (InputStream in = resource.getInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            in.transferTo(baos);
            return baos.toByteArray();
        }
    }

    /**
     * Stubs the LibreOffice executor so that running the soffice command writes a fake output file
     * (named {@code document.<ext>}) into the directory that follows {@code --outdir}.
     */
    private void stubLibreOfficeWritesOutput(
            MockedStatic<ProcessExecutor> mockedFactory, String primaryExt) throws Exception {
        ProcessExecutor executor = mock(ProcessExecutor.class);
        ProcessExecutorResult okResult = mock(ProcessExecutorResult.class);
        lenient().when(okResult.getRc()).thenReturn(0);

        when(executor.runCommandWithOutputHandling(any()))
                .thenAnswer(
                        inv -> {
                            List<String> cmd = inv.getArgument(0);
                            int outDirIdx = cmd.indexOf("--outdir");
                            Path outDir = Path.of(cmd.get(outDirIdx + 1));
                            Path outFile = outDir.resolve("document." + primaryExt);
                            Files.write(
                                    outFile, "converted-bytes".getBytes(StandardCharsets.UTF_8));
                            return okResult;
                        });

        mockedFactory
                .when(() -> ProcessExecutor.getInstance(ProcessExecutor.Processes.LIBRE_OFFICE))
                .thenReturn(executor);
    }

    @Nested
    @DisplayName("Presentation conversion")
    class PresentationConversion {

        @Test
        @DisplayName("pptx output streams the converted file back with 200")
        void presentationPptxSuccess() throws Exception {
            PdfToPresentationRequest request = new PdfToPresentationRequest();
            request.setFileInput(pdfFile());
            request.setOutputFormat("pptx");

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class)) {
                stubLibreOfficeWritesOutput(mockedFactory, "pptx");

                ResponseEntity<Resource> response = controller.processPdfToPresentation(request);

                assertEquals(HttpStatus.OK, response.getStatusCode());
                assertTrue(readResource(response.getBody()).length > 0);
            }
        }

        @Test
        @DisplayName("non-PDF input returns 400 without invoking LibreOffice")
        void presentationNonPdfReturnsBadRequest() throws Exception {
            PdfToPresentationRequest request = new PdfToPresentationRequest();
            request.setFileInput(nonPdfFile());
            request.setOutputFormat("pptx");

            ResponseEntity<Resource> response = controller.processPdfToPresentation(request);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        }

        @Test
        @DisplayName("LibreOffice IOException propagates from presentation conversion")
        void presentationLibreOfficeFailurePropagates() throws Exception {
            PdfToPresentationRequest request = new PdfToPresentationRequest();
            request.setFileInput(pdfFile());
            request.setOutputFormat("pptx");

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class)) {
                ProcessExecutor executor = mock(ProcessExecutor.class);
                when(executor.runCommandWithOutputHandling(any()))
                        .thenThrow(new IOException("soffice crashed"));
                mockedFactory
                        .when(
                                () ->
                                        ProcessExecutor.getInstance(
                                                ProcessExecutor.Processes.LIBRE_OFFICE))
                        .thenReturn(executor);

                assertThrows(IOException.class, () -> controller.processPdfToPresentation(request));
            }
        }
    }

    @Nested
    @DisplayName("Word conversion")
    class WordConversion {

        @Test
        @DisplayName("docx output streams the converted file back with 200")
        void wordDocxSuccess() throws Exception {
            PdfToWordRequest request = new PdfToWordRequest();
            request.setFileInput(pdfFile());
            request.setOutputFormat("docx");

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class)) {
                stubLibreOfficeWritesOutput(mockedFactory, "docx");

                ResponseEntity<Resource> response = controller.processPdfToWord(request);

                assertEquals(HttpStatus.OK, response.getStatusCode());
                assertTrue(readResource(response.getBody()).length > 0);
            }
        }

        @Test
        @DisplayName("unsupported output format returns 400")
        void wordUnsupportedFormatReturnsBadRequest() throws Exception {
            PdfToWordRequest request = new PdfToWordRequest();
            request.setFileInput(pdfFile());
            request.setOutputFormat("bogus");

            ResponseEntity<Resource> response = controller.processPdfToWord(request);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        }
    }

    @Nested
    @DisplayName("Text / RTF conversion")
    class TextRtfConversion {

        @Test
        @DisplayName("txt output uses PDFBox stripper, not LibreOffice")
        void txtUsesStripper() throws Exception {
            PdfToTextOrRTFRequest request = new PdfToTextOrRTFRequest();
            request.setFileInput(pdfFile());
            request.setOutputFormat("txt");

            PDDocument realDoc = new PDDocument();
            realDoc.addPage(new PDPage());
            when(pdfDocumentFactory.load(any(MockMultipartFile.class))).thenReturn(realDoc);

            ResponseEntity<Resource> response = controller.processPdfToRTForTXT(request);

            assertEquals(HttpStatus.OK, response.getStatusCode());
            assertEquals(MediaType.TEXT_PLAIN, response.getHeaders().getContentType());
        }

        @Test
        @DisplayName("rtf output delegates to LibreOffice and streams back")
        void rtfDelegatesToLibreOffice() throws Exception {
            PdfToTextOrRTFRequest request = new PdfToTextOrRTFRequest();
            request.setFileInput(pdfFile());
            request.setOutputFormat("rtf");

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class)) {
                stubLibreOfficeWritesOutput(mockedFactory, "rtf");

                ResponseEntity<Resource> response = controller.processPdfToRTForTXT(request);

                assertEquals(HttpStatus.OK, response.getStatusCode());
                assertTrue(readResource(response.getBody()).length > 0);
            }
        }

        @Test
        @DisplayName("txt branch closes temp file and rethrows when stripper load fails")
        void txtLoadFailurePropagates() throws Exception {
            PdfToTextOrRTFRequest request = new PdfToTextOrRTFRequest();
            request.setFileInput(pdfFile());
            request.setOutputFormat("txt");

            when(pdfDocumentFactory.load(any(MockMultipartFile.class)))
                    .thenThrow(new IOException("cannot parse pdf"));

            IOException thrown =
                    assertThrows(IOException.class, () -> controller.processPdfToRTForTXT(request));
            assertEquals("cannot parse pdf", thrown.getMessage());
        }
    }

    @Nested
    @DisplayName("XML conversion")
    class XmlConversion {

        @Test
        @DisplayName("xml output streams the converted file back with 200")
        void xmlSuccess() throws Exception {
            PDFFile file = new PDFFile();
            file.setFileInput(pdfFile());

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class)) {
                stubLibreOfficeWritesOutput(mockedFactory, "xml");

                ResponseEntity<Resource> response = controller.processPdfToXML(file);

                assertEquals(HttpStatus.OK, response.getStatusCode());
                assertTrue(readResource(response.getBody()).length > 0);
            }
        }

        @Test
        @DisplayName("non-PDF input returns 400 for xml conversion")
        void xmlNonPdfReturnsBadRequest() throws Exception {
            PDFFile file = new PDFFile();
            file.setFileInput(nonPdfFile());

            ResponseEntity<Resource> response = controller.processPdfToXML(file);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        }
    }
}
