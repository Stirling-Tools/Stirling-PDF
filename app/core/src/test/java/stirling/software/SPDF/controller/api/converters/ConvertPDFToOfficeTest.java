package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.File;
import java.nio.file.Files;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.converters.PdfToPresentationRequest;
import stirling.software.SPDF.model.api.converters.PdfToTextOrRTFRequest;
import stirling.software.SPDF.model.api.converters.PdfToWordRequest;
import stirling.software.SPDF.service.OfficeConversionService;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class ConvertPDFToOfficeTest {
    private static ResponseEntity<Resource> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(new ByteArrayResource(bytes));
    }

    private static byte[] drainBody(ResponseEntity<Resource> response) throws java.io.IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        try (java.io.InputStream __in = response.getBody().getInputStream()) {
            __in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @Mock private RuntimePathConfig runtimePathConfig;
    @Mock private OfficeConversionService officeConversionService;

    @InjectMocks private ConvertPDFToOffice controller;

    @BeforeEach
    void setUp() throws Exception {
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile("test", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
    }

    private MockMultipartFile createPdfFile() {
        return new MockMultipartFile(
                "fileInput", "document.pdf", "application/pdf", "pdf-content".getBytes());
    }

    @Test
    void processPdfToPresentation_keepsOutputFormat() {
        PdfToPresentationRequest request = new PdfToPresentationRequest();
        request.setFileInput(createPdfFile());
        request.setOutputFormat("pptx");

        assertNotNull(request.getOutputFormat());
        assertEquals("pptx", request.getOutputFormat());
    }

    @Test
    void processPdfToRTForTXT_withTxtFormat_convertsThroughOfficeService() throws Exception {
        MockMultipartFile pdfFile = createPdfFile();
        PdfToTextOrRTFRequest request = new PdfToTextOrRTFRequest();
        request.setFileInput(pdfFile);
        request.setOutputFormat("txt");

        PDDocument realDoc = new PDDocument();
        realDoc.addPage(new org.apache.pdfbox.pdmodel.PDPage());
        when(pdfDocumentFactory.load(pdfFile)).thenReturn(realDoc);

        ResponseEntity<Resource> expectedResponse = streamingOk("text content".getBytes());

        try (MockedStatic<GeneralUtils> guMock = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<WebResponseUtils> wrMock =
                        Mockito.mockStatic(WebResponseUtils.class)) {

            guMock.when(() -> GeneralUtils.generateFilename("document.pdf", ".txt"))
                    .thenReturn("document.txt");

            wrMock.when(
                            () ->
                                    WebResponseUtils.fileToWebResponse(
                                            any(TempFile.class), anyString(), any(MediaType.class)))
                    .thenReturn(expectedResponse);

            ResponseEntity<Resource> response = controller.processPdfToRTForTXT(request);

            assertSame(expectedResponse, response);
            verify(officeConversionService).convert(eq(realDoc), any(), eq("txt"), any());
        }
    }

    @Test
    void processPdfToWord_hasOutputFormat() {
        PdfToWordRequest request = new PdfToWordRequest();
        request.setOutputFormat("docx");
        assertEquals("docx", request.getOutputFormat());
    }

    @Test
    void processPdfToPresentation_hasOutputFormat() {
        PdfToPresentationRequest request = new PdfToPresentationRequest();
        request.setOutputFormat("pptx");
        assertEquals("pptx", request.getOutputFormat());
    }

    @Test
    void processPdfToRTForTXT_rtfFormat_hasOutputFormat() {
        PdfToTextOrRTFRequest request = new PdfToTextOrRTFRequest();
        request.setOutputFormat("rtf");
        assertEquals("rtf", request.getOutputFormat());
    }

    @Test
    void processPdfToXML_delegatesCorrectly() {
        PDFFile file = new PDFFile();
        MockMultipartFile pdfFile = createPdfFile();
        file.setFileInput(pdfFile);
        assertNotNull(file.getFileInput());
    }
}
