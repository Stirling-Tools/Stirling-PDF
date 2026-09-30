package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
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
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.converters.PdfToPresentationRequest;
import stirling.software.SPDF.model.api.converters.PdfToTextOrRTFRequest;
import stirling.software.SPDF.model.api.converters.PdfToWordRequest;
import stirling.software.SPDF.service.OfficeConversionService;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.ProcessExecutor;
import stirling.software.common.util.ProcessExecutor.ProcessExecutorResult;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

/**
 * Coverage for {@link ConvertPDFToOffice}. Word, presentation, RTF and text run through Stirling
 * Office Convert in process, on a real one-page PDF, and the files that come back are checked. XML
 * falls back to LibreOffice through the static {@link ProcessExecutor} factory, mocked with {@code
 * mockStatic} so that no LibreOffice runs.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ConvertPDFToOfficeMoreTest {

    private static final String HEADING = "Quarterly report";
    private static final String LINE = "Sales rose in every region this quarter.";

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @Mock private RuntimePathConfig runtimePathConfig;
    @Mock private EndpointConfiguration endpointConfiguration;

    private ConvertPDFToOffice controller;

    @BeforeEach
    void setUp() throws Exception {
        controller =
                new ConvertPDFToOffice(
                        pdfDocumentFactory,
                        tempFileManager,
                        runtimePathConfig,
                        new OfficeConversionService(new ApplicationProperties()),
                        endpointConfiguration);

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
        // The controller closes each document it converts, so every load gets a fresh one.
        lenient()
                .when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(inv -> report());

        // XML's PDFToFile creates its own TempFile(manager, suffix) and a TempDirectory.
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
        lenient()
                .when(tempFileManager.createTempDirectory())
                .thenAnswer(inv -> Files.createTempDirectory("conv-dir"));
        lenient().when(runtimePathConfig.getUnoConvertPath()).thenReturn("");
        lenient().when(runtimePathConfig.getSOfficePath()).thenReturn("soffice");
    }

    private static PDDocument report() throws IOException {
        PDDocument doc = new PDDocument();
        PDPage page = new PDPage(PDRectangle.A4);
        doc.addPage(page);
        PDType1Font font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            cs.beginText();
            cs.setFont(font, 20);
            cs.newLineAtOffset(72, 760);
            cs.showText(HEADING);
            cs.setFont(font, 11);
            cs.newLineAtOffset(0, -30);
            cs.showText(LINE);
            cs.endText();
        }
        return doc;
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

    /** The text of one part of a zipped Office file, or null when the package lacks it. */
    private static String part(byte[] zip, String name) throws IOException {
        try (ZipInputStream in = new ZipInputStream(new ByteArrayInputStream(zip))) {
            for (ZipEntry e; (e = in.getNextEntry()) != null; ) {
                if (e.getName().equals(name)) {
                    return new String(in.readAllBytes(), StandardCharsets.UTF_8);
                }
            }
        }
        return null;
    }

    private static byte[] ok(ResponseEntity<Resource> response, String fileName)
            throws IOException {
        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(fileName, response.getHeaders().getContentDisposition().getFilename());
        return readResource(response.getBody());
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

        private ResponseEntity<Resource> convert(String format) throws IOException {
            PdfToPresentationRequest request = new PdfToPresentationRequest();
            request.setFileInput(pdfFile());
            request.setOutputFormat(format);
            return controller.processPdfToPresentation(request);
        }

        @Test
        @DisplayName("pptx holds a slide with the page's text")
        void presentationPptx() throws Exception {
            byte[] pptx = ok(convert("pptx"), "document.pptx");
            assertTrue(part(pptx, "ppt/slides/slide1.xml").contains(HEADING));
        }

        @Test
        @DisplayName("odp is an OpenDocument presentation with the page's text")
        void presentationOdp() throws Exception {
            byte[] odp = ok(convert("odp"), "document.odp");
            assertEquals("application/vnd.oasis.opendocument.presentation", part(odp, "mimetype"));
            assertTrue(part(odp, "content.xml").contains(HEADING));
        }

        @Test
        @DisplayName("ppt is a binary PowerPoint file")
        void presentationPpt() throws Exception {
            byte[] ppt = ok(convert("ppt"), "document.ppt");
            // OLE2 compound document signature.
            assertEquals(0xD0, ppt[0] & 0xFF);
            assertEquals(0xCF, ppt[1] & 0xFF);
            assertEquals(0x11, ppt[2] & 0xFF);
            assertEquals(0xE0, ppt[3] & 0xFF);
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
        @DisplayName("a document that will not load fails the conversion")
        void presentationLoadFailurePropagates() throws Exception {
            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenThrow(new IOException("cannot parse pdf"));

            assertThrows(IOException.class, () -> convert("pptx"));
        }
    }

    @Nested
    @DisplayName("Word conversion")
    class WordConversion {

        private ResponseEntity<Resource> convert(String format) throws IOException {
            PdfToWordRequest request = new PdfToWordRequest();
            request.setFileInput(pdfFile());
            request.setOutputFormat(format);
            return controller.processPdfToWord(request);
        }

        @Test
        @DisplayName("docx holds the page's heading and paragraph")
        void wordDocx() throws Exception {
            String xml = part(ok(convert("docx"), "document.docx"), "word/document.xml");
            assertTrue(xml.contains(HEADING));
            assertTrue(xml.contains(LINE));
        }

        @Test
        @DisplayName("odt is an OpenDocument text with the page's text")
        void wordOdt() throws Exception {
            byte[] odt = ok(convert("odt"), "document.odt");
            assertEquals("application/vnd.oasis.opendocument.text", part(odt, "mimetype"));
            assertTrue(part(odt, "content.xml").contains(LINE));
        }

        @Test
        @DisplayName("doc is RTF, which Word opens as a document")
        void wordDoc() throws Exception {
            String rtf = new String(ok(convert("doc"), "document.doc"), StandardCharsets.US_ASCII);
            assertTrue(rtf.startsWith("{\\rtf"));
            assertTrue(rtf.contains(HEADING));
        }

        @Test
        @DisplayName("unsupported output format returns 400")
        void wordUnsupportedFormatReturnsBadRequest() throws Exception {
            assertEquals(HttpStatus.BAD_REQUEST, convert("bogus").getStatusCode());
        }
    }

    @Nested
    @DisplayName("Text / RTF conversion")
    class TextRtfConversion {

        private ResponseEntity<Resource> convert(String format) throws IOException {
            PdfToTextOrRTFRequest request = new PdfToTextOrRTFRequest();
            request.setFileInput(pdfFile());
            request.setOutputFormat(format);
            return controller.processPdfToRTForTXT(request);
        }

        @Test
        @DisplayName("txt is plain text in reading order")
        void txtInReadingOrder() throws Exception {
            ResponseEntity<Resource> response = convert("txt");
            String text = new String(ok(response, "document.txt"), StandardCharsets.UTF_8);
            assertEquals(MediaType.TEXT_PLAIN, response.getHeaders().getContentType());
            assertTrue(text.indexOf(HEADING) >= 0 && text.indexOf(HEADING) < text.indexOf(LINE));
        }

        @Test
        @DisplayName("rtf is an RTF document with the page's text")
        void rtfDocument() throws Exception {
            String rtf = new String(ok(convert("rtf"), "document.rtf"), StandardCharsets.US_ASCII);
            assertTrue(rtf.startsWith("{\\rtf"));
            assertTrue(rtf.contains(HEADING));
        }

        @Test
        @DisplayName("a document that will not load fails the text conversion")
        void txtLoadFailurePropagates() throws Exception {
            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenThrow(new IOException("cannot parse pdf"));

            IOException thrown = assertThrows(IOException.class, () -> convert("txt"));
            assertEquals("cannot parse pdf", thrown.getMessage());
        }
    }

    @Nested
    @DisplayName("XML conversion")
    class XmlConversion {

        @Test
        @DisplayName("xml is flat OpenDocument Text converted in process, without LibreOffice")
        void xmlConvertsInProcess() throws Exception {
            PDFFile file = new PDFFile();
            file.setFileInput(pdfFile());

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class)) {
                String xml =
                        new String(
                                ok(controller.processPdfToXML(file), "document.xml"),
                                StandardCharsets.UTF_8);

                assertTrue(xml.contains("<office:document "), xml);
                assertTrue(
                        xml.contains(
                                "office:mimetype=\"application/vnd.oasis.opendocument.text\""));
                assertTrue(xml.contains(HEADING) && xml.contains(LINE));
                mockedFactory.verifyNoInteractions();
            }
        }

        @Test
        @DisplayName("xml falls back to LibreOffice when the in-process conversion fails")
        void xmlFallsBackToLibreOffice() throws Exception {
            PDFFile file = new PDFFile();
            file.setFileInput(pdfFile());
            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenThrow(new IOException("cannot parse pdf"));
            when(endpointConfiguration.isGroupEnabled("LibreOffice")).thenReturn(true);

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class)) {
                stubLibreOfficeWritesOutput(mockedFactory, "xml");

                ResponseEntity<Resource> response = controller.processPdfToXML(file);

                assertEquals(
                        "converted-bytes",
                        new String(ok(response, "document.xml"), StandardCharsets.UTF_8));
            }
        }

        @Test
        @DisplayName("xml fails without LibreOffice when the in-process conversion fails")
        void xmlFailureWithoutLibreOfficePropagates() throws Exception {
            PDFFile file = new PDFFile();
            file.setFileInput(pdfFile());
            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenThrow(new IOException("cannot parse pdf"));

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class)) {
                IOException thrown =
                        assertThrows(IOException.class, () -> controller.processPdfToXML(file));
                assertEquals("cannot parse pdf", thrown.getMessage());
                mockedFactory.verifyNoInteractions();
            }
        }

        @Test
        @DisplayName("an xml conversion stopped for memory never falls back to LibreOffice")
        void xmlMemoryStopDoesNotFallBack() throws Exception {
            PDFFile file = new PDFFile();
            file.setFileInput(pdfFile());
            when(pdfDocumentFactory.load(any(MultipartFile.class)))
                    .thenThrow(new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE));
            when(endpointConfiguration.isGroupEnabled("LibreOffice")).thenReturn(true);

            try (MockedStatic<ProcessExecutor> mockedFactory = mockStatic(ProcessExecutor.class)) {
                assertThrows(ResponseStatusException.class, () -> controller.processPdfToXML(file));
                mockedFactory.verifyNoInteractions();
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
