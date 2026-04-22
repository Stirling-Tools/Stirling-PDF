package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.service.PdfJsonConversionService;
import stirling.software.common.model.api.GeneralFile;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class ConvertPdfJsonControllerTest {

    @Mock private PdfJsonConversionService pdfJsonConversionService;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private ConvertPdfJsonController controller;

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

    private static byte[] drainBody(ResponseEntity<Resource> response) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (java.io.InputStream __in = response.getBody().getInputStream()) {
            __in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    @Test
    void convertPdfToJson_nullFileInputThrows() {
        PDFFile request = new PDFFile();
        request.setFileInput(null);

        assertThrows(Exception.class, () -> controller.convertPdfToJson(request, false));
    }

    @Test
    void convertPdfToJson_success() throws Exception {
        byte[] jsonBytes = "{\"pages\":[]}".getBytes();
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "doc.pdf", "application/pdf", "content".getBytes());
        PDFFile request = new PDFFile();
        request.setFileInput(pdfFile);

        when(pdfJsonConversionService.convertPdfToJson(pdfFile, false)).thenReturn(jsonBytes);

        ResponseEntity<Resource> response = controller.convertPdfToJson(request, false);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
    }

    @Test
    void convertPdfToJson_lightweightMode() throws Exception {
        byte[] jsonBytes = "{\"pages\":[]}".getBytes();
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "doc.pdf", "application/pdf", "content".getBytes());
        PDFFile request = new PDFFile();
        request.setFileInput(pdfFile);

        when(pdfJsonConversionService.convertPdfToJson(pdfFile, true)).thenReturn(jsonBytes);

        ResponseEntity<Resource> response = controller.convertPdfToJson(request, true);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(pdfJsonConversionService).convertPdfToJson(pdfFile, true);
    }

    @Test
    void convertJsonToPdf_nullFileInputThrows() {
        GeneralFile request = new GeneralFile();
        request.setFileInput(null);

        assertThrows(Exception.class, () -> controller.convertJsonToPdf(request));
    }

    @Test
    void convertJsonToPdf_success() throws Exception {
        byte[] pdfBytes = "pdf-content".getBytes();
        MockMultipartFile jsonFile =
                new MockMultipartFile(
                        "fileInput", "doc.json", "application/json", "{\"pages\":[]}".getBytes());
        GeneralFile request = new GeneralFile();
        request.setFileInput(jsonFile);

        when(pdfJsonConversionService.convertJsonToPdf(jsonFile)).thenReturn(pdfBytes);

        ResponseEntity<Resource> response = controller.convertJsonToPdf(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
    }

    @Test
    void extractPdfMetadata_nullFileInputThrows() {
        PDFFile request = new PDFFile();
        request.setFileInput(null);

        assertThrows(Exception.class, () -> controller.extractPdfMetadata(request));
    }

    @Test
    void extractPdfMetadata_success() throws Exception {
        byte[] jsonBytes = "{\"metadata\":{}}".getBytes();
        MockMultipartFile pdfFile =
                new MockMultipartFile(
                        "fileInput", "doc.pdf", "application/pdf", "content".getBytes());
        PDFFile request = new PDFFile();
        request.setFileInput(pdfFile);

        when(pdfJsonConversionService.extractDocumentMetadata(eq(pdfFile), any(String.class)))
                .thenReturn(jsonBytes);

        ResponseEntity<Resource> response = controller.extractPdfMetadata(request);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(MediaType.APPLICATION_JSON, response.getHeaders().getContentType());
        assertNotNull(response.getHeaders().getFirst("X-Job-Id"));
    }

    @Test
    void clearCache_success() {
        String jobId = "test-job-id";

        ResponseEntity<Void> response = controller.clearCache(jobId);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        verify(pdfJsonConversionService).clearCachedDocument(jobId);
    }

    @Test
    void extractSinglePage_success() throws Exception {
        byte[] jsonBytes = "{\"content\":[]}".getBytes();
        String jobId = "test-job-id";

        when(pdfJsonConversionService.extractSinglePage(jobId, 1)).thenReturn(jsonBytes);

        ResponseEntity<Resource> response = controller.extractSinglePage(jobId, 1);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
    }

    @Test
    void extractPageFonts_success() throws Exception {
        byte[] jsonBytes = "{\"fonts\":[]}".getBytes();
        String jobId = "test-job-id";

        when(pdfJsonConversionService.extractPageFonts(jobId, 1)).thenReturn(jsonBytes);

        ResponseEntity<Resource> response = controller.extractPageFonts(jobId, 1);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertNotNull(response.getBody());
    }
}
