package stirling.software.SPDF.controller.api.converters;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.StreamingResponseBody;

import stirling.software.SPDF.model.api.converters.SvgToPdfRequest;
import stirling.software.SPDF.utils.SvgToPdf;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.SvgSanitizer;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class ConvertSvgToPDFTest {
    private static ResponseEntity<StreamingResponseBody> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(out -> out.write(bytes));
    }

    private static byte[] drainBody(ResponseEntity<StreamingResponseBody> response)
            throws java.io.IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        response.getBody().writeTo(baos);
        return baos.toByteArray();
    }

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private SvgSanitizer svgSanitizer;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private ConvertSvgToPDF controller;

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

    @Test
    void convertSvgToPdf_nullFilesReturnsBadRequest() throws java.io.IOException {
        SvgToPdfRequest request = new SvgToPdfRequest();
        request.setFileInput(null);

        ResponseEntity<StreamingResponseBody> response = controller.convertSvgToPdf(request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertTrue(
                new String(drainBody(response), StandardCharsets.UTF_8)
                        .contains("No files provided"));
    }

    @Test
    void convertSvgToPdf_emptyFilesArrayReturnsBadRequest() {
        SvgToPdfRequest request = new SvgToPdfRequest();
        request.setFileInput(new MockMultipartFile[0]);

        ResponseEntity<StreamingResponseBody> response = controller.convertSvgToPdf(request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void convertSvgToPdf_nonSvgFileSkipped() throws IOException {
        MockMultipartFile txtFile =
                new MockMultipartFile("fileInput", "test.txt", "text/plain", "content".getBytes());

        SvgToPdfRequest request = new SvgToPdfRequest();
        request.setFileInput(new MockMultipartFile[] {txtFile});
        request.setCombineIntoSinglePdf(false);

        ResponseEntity<StreamingResponseBody> response = controller.convertSvgToPdf(request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertTrue(
                new String(drainBody(response), StandardCharsets.UTF_8).contains("No valid SVG"));
    }

    @Test
    void convertSvgToPdf_emptyFileSkipped() throws IOException {
        MockMultipartFile emptyFile =
                new MockMultipartFile("fileInput", "test.svg", "image/svg+xml", new byte[0]);

        SvgToPdfRequest request = new SvgToPdfRequest();
        request.setFileInput(new MockMultipartFile[] {emptyFile});
        request.setCombineIntoSinglePdf(false);

        ResponseEntity<StreamingResponseBody> response = controller.convertSvgToPdf(request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void convertSvgToPdf_singleSvgSuccess() throws Exception {
        byte[] svgContent = "<svg></svg>".getBytes();
        byte[] sanitizedSvg = "<svg>sanitized</svg>".getBytes();
        byte[] pdfBytes = "pdf-output".getBytes();
        byte[] processedPdf = "processed-pdf".getBytes();

        MockMultipartFile svgFile =
                new MockMultipartFile("fileInput", "drawing.svg", "image/svg+xml", svgContent);

        SvgToPdfRequest request = new SvgToPdfRequest();
        request.setFileInput(new MockMultipartFile[] {svgFile});
        request.setCombineIntoSinglePdf(false);

        when(svgSanitizer.sanitize(svgContent)).thenReturn(sanitizedSvg);
        when(pdfDocumentFactory.createNewBytesBasedOnOldDocument(pdfBytes))
                .thenReturn(processedPdf);

        ResponseEntity<StreamingResponseBody> expectedResponse = streamingOk(processedPdf);

        try (MockedStatic<SvgToPdf> svgMock = Mockito.mockStatic(SvgToPdf.class);
                MockedStatic<GeneralUtils> guMock = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<WebResponseUtils> wrMock =
                        Mockito.mockStatic(WebResponseUtils.class)) {

            svgMock.when(() -> SvgToPdf.convert(sanitizedSvg)).thenReturn(pdfBytes);

            guMock.when(() -> GeneralUtils.generateFilename("drawing.svg", ".pdf"))
                    .thenReturn("drawing.pdf");

            wrMock.when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            ResponseEntity<StreamingResponseBody> response = controller.convertSvgToPdf(request);

            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
    }

    @Test
    void convertSvgToPdf_combinedMode() throws Exception {
        byte[] svgContent1 = "<svg>1</svg>".getBytes();
        byte[] svgContent2 = "<svg>2</svg>".getBytes();
        byte[] sanitizedSvg1 = "<svg>s1</svg>".getBytes();
        byte[] sanitizedSvg2 = "<svg>s2</svg>".getBytes();
        byte[] combinedPdf = "combined-pdf".getBytes();
        byte[] processedPdf = "processed-combined".getBytes();

        MockMultipartFile svgFile1 =
                new MockMultipartFile("fileInput", "a.svg", "image/svg+xml", svgContent1);
        MockMultipartFile svgFile2 =
                new MockMultipartFile("fileInput", "b.svg", "image/svg+xml", svgContent2);

        SvgToPdfRequest request = new SvgToPdfRequest();
        request.setFileInput(new MockMultipartFile[] {svgFile1, svgFile2});
        request.setCombineIntoSinglePdf(true);

        when(svgSanitizer.sanitize(svgContent1)).thenReturn(sanitizedSvg1);
        when(svgSanitizer.sanitize(svgContent2)).thenReturn(sanitizedSvg2);
        when(pdfDocumentFactory.createNewBytesBasedOnOldDocument(combinedPdf))
                .thenReturn(processedPdf);

        ResponseEntity<StreamingResponseBody> expectedResponse = streamingOk(processedPdf);

        try (MockedStatic<SvgToPdf> svgMock = Mockito.mockStatic(SvgToPdf.class);
                MockedStatic<GeneralUtils> guMock = Mockito.mockStatic(GeneralUtils.class);
                MockedStatic<WebResponseUtils> wrMock =
                        Mockito.mockStatic(WebResponseUtils.class)) {

            svgMock.when(() -> SvgToPdf.combineIntoPdf(any())).thenReturn(combinedPdf);

            guMock.when(() -> GeneralUtils.generateFilename("a.svg", "_combined.pdf"))
                    .thenReturn("a_combined.pdf");

            wrMock.when(
                            () ->
                                    WebResponseUtils.pdfFileToWebResponse(
                                            any(TempFile.class), anyString()))
                    .thenReturn(expectedResponse);

            ResponseEntity<StreamingResponseBody> response = controller.convertSvgToPdf(request);

            assertEquals(HttpStatus.OK, response.getStatusCode());
        }
    }

    @Test
    void convertSvgToPdf_nullFilenameSkipped() throws IOException {
        MockMultipartFile nullNameFile =
                new MockMultipartFile("fileInput", null, "image/svg+xml", "svg".getBytes());

        SvgToPdfRequest request = new SvgToPdfRequest();
        request.setFileInput(new MockMultipartFile[] {nullNameFile});
        request.setCombineIntoSinglePdf(false);

        ResponseEntity<StreamingResponseBody> response = controller.convertSvgToPdf(request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }

    @Test
    void convertSvgToPdf_sanitizationFailureSkipsFile() throws IOException {
        byte[] svgContent = "<svg>bad</svg>".getBytes();
        MockMultipartFile svgFile =
                new MockMultipartFile("fileInput", "bad.svg", "image/svg+xml", svgContent);

        SvgToPdfRequest request = new SvgToPdfRequest();
        request.setFileInput(new MockMultipartFile[] {svgFile});
        request.setCombineIntoSinglePdf(false);

        when(svgSanitizer.sanitize(svgContent)).thenThrow(new IOException("sanitization error"));

        ResponseEntity<StreamingResponseBody> response = controller.convertSvgToPdf(request);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
    }
}
