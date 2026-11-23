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
import org.springframework.web.server.ResponseStatusException;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.converters.PdfToPresentationRequest;
import stirling.software.SPDF.model.api.converters.PdfToTextOrRTFRequest;
import stirling.software.SPDF.model.api.converters.PdfToWordRequest;
import stirling.software.SPDF.service.OfficeConversionService;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

/**
 * Additional tests for {@link ConvertPDFToOffice}. The converter is mocked to write a fake output
 * file, and {@link ProcessExecutor} is mocked statically to prove no external process runs.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ConvertPDFToOfficeMoreTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @Mock private OfficeConversionService officeConversionService;
    @Mock private EndpointConfiguration endpointConfiguration;

    @InjectMocks private ConvertPDFToOffice controller;

    @BeforeEach
    void setUp() throws Exception {
        lenient().when(endpointConfiguration.isEndpointEnabled("pdf-to-rtf")).thenReturn(true);
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

    /** Makes the mocked converter write a fake output file to its target path. */
    private void stubConverterWritesOutput() throws Exception {
        lenient()
                .doAnswer(
                        inv -> {
                            Path out = inv.getArgument(1);
                            Files.write(out, "converted-bytes".getBytes(StandardCharsets.UTF_8));
                            return null;
                        })
                .when(officeConversionService)
                .convert(any(), any(Path.class), any(String.class), any());
    }

    private static byte[] readResource(Resource resource) throws IOException {
        try (InputStream in = resource.getInputStream();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            in.transferTo(baos);
            return baos.toByteArray();
        }
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
                stubConverterWritesOutput();

                ResponseEntity<Resource> response = controller.processPdfToPresentation(request);

                assertEquals(HttpStatus.OK, response.getStatusCode());
                assertTrue(readResource(response.getBody()).length > 0);
            }
        }

        @Test
        @DisplayName("non-PDF input returns 400 without converting")
        void presentationNonPdfReturnsBadRequest() throws Exception {
            PdfToPresentationRequest request = new PdfToPresentationRequest();
            request.setFileInput(nonPdfFile());
            request.setOutputFormat("pptx");

            ResponseEntity<Resource> response = controller.processPdfToPresentation(request);

            assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        }

        @Test
        @DisplayName("a converter IOException propagates from presentation conversion")
        void presentationConverterFailurePropagates() throws Exception {
            PdfToPresentationRequest request = new PdfToPresentationRequest();
            request.setFileInput(pdfFile());
            request.setOutputFormat("pptx");

            org.mockito.Mockito.doThrow(new IOException("conversion failed"))
                    .when(officeConversionService)
                    .convert(any(), any(Path.class), any(String.class), any());

            assertThrows(IOException.class, () -> controller.processPdfToPresentation(request));
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
                stubConverterWritesOutput();

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
        @DisplayName("txt output is served as plain text")
        void txtIsPlainText() throws Exception {
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
        @DisplayName("rtf output streams the converted file back")
        void rtfStreamsBack() throws Exception {
            PdfToTextOrRTFRequest request = new PdfToTextOrRTFRequest();
            request.setFileInput(pdfFile());
            request.setOutputFormat("rtf");

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class)) {
                stubConverterWritesOutput();

                ResponseEntity<Resource> response = controller.processPdfToRTForTXT(request);

                assertEquals(HttpStatus.OK, response.getStatusCode());
                assertTrue(readResource(response.getBody()).length > 0);
            }
        }

        @Test
        @DisplayName("txt closes the temp file and rethrows when the load fails")
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
    @DisplayName("Format and endpoint gates")
    class FormatGates {

        private PdfToTextOrRTFRequest textRequest(String format) {
            PdfToTextOrRTFRequest request = new PdfToTextOrRTFRequest();
            request.setFileInput(pdfFile());
            request.setOutputFormat(format);
            return request;
        }

        @Test
        @DisplayName("rtf answers 403 when pdf-to-rtf is disabled, without converting")
        void rtfRefusedWhenItsEndpointIsDisabled() {
            when(endpointConfiguration.isEndpointEnabled("pdf-to-rtf")).thenReturn(false);

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class)) {
                ResponseStatusException thrown =
                        assertThrows(
                                ResponseStatusException.class,
                                () -> controller.processPdfToRTForTXT(textRequest("rtf")));
                assertEquals(HttpStatus.FORBIDDEN, thrown.getStatusCode());
                mockedFactory.verifyNoInteractions();
            }
        }

        @Test
        @DisplayName("txt still converts when pdf-to-rtf is disabled")
        void txtUnaffectedByRtfRemoval() throws Exception {
            when(endpointConfiguration.isEndpointEnabled("pdf-to-rtf")).thenReturn(false);
            PDDocument realDoc = new PDDocument();
            realDoc.addPage(new PDPage());
            when(pdfDocumentFactory.load(any(MockMultipartFile.class))).thenReturn(realDoc);

            ResponseEntity<Resource> response = controller.processPdfToRTForTXT(textRequest("txt"));

            assertEquals(HttpStatus.OK, response.getStatusCode());
        }

        @Test
        @DisplayName("an invalid format is still a 400 when pdf-to-rtf is disabled")
        void invalidFormatIsBadRequestWhenRtfRemoved() throws Exception {
            when(endpointConfiguration.isEndpointEnabled("pdf-to-rtf")).thenReturn(false);

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class)) {
                for (String format : new String[] {"docx", null}) {
                    assertEquals(
                            HttpStatus.BAD_REQUEST,
                            controller.processPdfToRTForTXT(textRequest(format)).getStatusCode(),
                            String.valueOf(format));
                }
                mockedFactory.verifyNoInteractions();
            }
        }

        @Test
        @DisplayName("text endpoint no longer serves the Word and XML formats")
        void textEndpointRejectsOtherOfficeFormats() throws Exception {
            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class)) {
                for (String format : new String[] {"doc", "docx", "odt", "xml"}) {
                    assertEquals(
                            HttpStatus.BAD_REQUEST,
                            controller.processPdfToRTForTXT(textRequest(format)).getStatusCode(),
                            format);
                }
                mockedFactory.verifyNoInteractions();
            }
        }

        @Test
        @DisplayName("word endpoint rejects xml")
        void wordEndpointRejectsXml() throws Exception {
            PdfToWordRequest request = new PdfToWordRequest();
            request.setFileInput(pdfFile());
            request.setOutputFormat("xml");

            assertEquals(
                    HttpStatus.BAD_REQUEST, controller.processPdfToWord(request).getStatusCode());
        }

        @Test
        @DisplayName("word endpoint explains that .doc output is gone")
        void wordEndpointExplainsDoc() {
            PdfToWordRequest request = new PdfToWordRequest();
            request.setFileInput(pdfFile());
            request.setOutputFormat("doc");

            IllegalArgumentException e =
                    org.junit.jupiter.api.Assertions.assertThrows(
                            IllegalArgumentException.class,
                            () -> controller.processPdfToWord(request));
            org.junit.jupiter.api.Assertions.assertTrue(
                    e.getMessage().contains("use docx or odt"), e.getMessage());
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
                stubConverterWritesOutput();

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
