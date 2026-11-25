package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
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

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.converters.PdfToPresentationRequest;
import stirling.software.SPDF.model.api.converters.PdfToTextOrRTFRequest;
import stirling.software.SPDF.model.api.converters.PdfToWordRequest;
import stirling.software.SPDF.service.OfficeConversionService;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
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
    @Mock private OfficeConversionService officeConversionService;
    @Mock private EndpointConfiguration endpointConfiguration;

    @InjectMocks private ConvertPDFToOffice controller;

    @BeforeEach
    void setUp() throws Exception {
        lenient().when(endpointConfiguration.isEndpointEnabled("pdf-to-rtf")).thenReturn(true);
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

    @Test
    void processPdfToWord_usesOfficeConvert() throws Exception {
        MockMultipartFile pdfFile = createPdfFile();
        when(pdfDocumentFactory.load(pdfFile)).thenReturn(new PDDocument());
        PdfToWordRequest request = new PdfToWordRequest();
        request.setFileInput(pdfFile);
        request.setOutputFormat("docx");

        try (MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class)) {
            wr.when(() -> WebResponseUtils.fileToWebResponse(any(), anyString(), any()))
                    .thenReturn(streamingOk("docx".getBytes()));

            assertEquals(200, controller.processPdfToWord(request).getStatusCode().value());
        }
        Mockito.verify(officeConversionService)
                .convert(any(PDDocument.class), any(), Mockito.eq("docx"), any());
    }

    @Test
    void officeConvertWithoutOutputFormatIsBadRequest() throws Exception {
        PdfToWordRequest request = new PdfToWordRequest();
        request.setFileInput(createPdfFile());

        assertEquals(400, controller.processPdfToWord(request).getStatusCode().value());
        Mockito.verify(officeConversionService, Mockito.never())
                .convert(any(PDDocument.class), any(), any(), any());
    }

    @Test
    void processPdfToRTForTXT_withTxtFormat_usesStripper() throws Exception {
        MockMultipartFile pdfFile = createPdfFile();
        PdfToTextOrRTFRequest request = new PdfToTextOrRTFRequest();
        request.setFileInput(pdfFile);
        request.setOutputFormat("txt");
        PDDocument realDoc = new PDDocument();
        realDoc.addPage(new org.apache.pdfbox.pdmodel.PDPage());
        when(pdfDocumentFactory.load(pdfFile)).thenReturn(realDoc);
        ResponseEntity<Resource> expectedResponse = streamingOk("text content".getBytes());

        try (MockedStatic<WebResponseUtils> wr = Mockito.mockStatic(WebResponseUtils.class)) {
            wr.when(
                            () ->
                                    WebResponseUtils.fileToWebResponse(
                                            any(), anyString(), Mockito.eq(MediaType.TEXT_PLAIN)))
                    .thenReturn(expectedResponse);

            assertSame(expectedResponse, controller.processPdfToRTForTXT(request));
        }
        Mockito.verifyNoInteractions(officeConversionService);
    }
}
