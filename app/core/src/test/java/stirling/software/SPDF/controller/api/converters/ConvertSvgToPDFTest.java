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
import java.util.List;

import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;

import jakarta.ws.rs.core.Response;

import stirling.software.SPDF.utils.SvgToPdf;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.testsupport.TestFileUploads;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.SvgSanitizer;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

@ExtendWith(MockitoExtension.class)
class ConvertSvgToPDFTest {

    private static Response streamingOk(byte[] bytes) {
        return Response.ok(bytes).build();
    }

    private static byte[] bodyBytes(Response response) {
        Object entity = response.getEntity();
        return entity instanceof byte[] ? (byte[]) entity : new byte[0];
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
    void convertSvgToPdf_nullFilesReturnsBadRequest() {
        Response response = controller.convertSvgToPdf(null, false);

        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
        assertTrue(
                new String(bodyBytes(response), StandardCharsets.UTF_8)
                        .contains("No files provided"));
    }

    @Test
    void convertSvgToPdf_emptyFilesArrayReturnsBadRequest() {
        Response response = controller.convertSvgToPdf(List.of(), false);

        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
    }

    @Test
    void convertSvgToPdf_nonSvgFileSkipped() {
        FileUpload txtFile = TestFileUploads.of("content".getBytes(), "test.txt", "text/plain");

        Response response = controller.convertSvgToPdf(List.of(txtFile), false);

        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
        assertTrue(
                new String(bodyBytes(response), StandardCharsets.UTF_8).contains("No valid SVG"));
    }

    @Test
    void convertSvgToPdf_emptyFileSkipped() {
        FileUpload emptyFile = TestFileUploads.of(new byte[0], "test.svg", "image/svg+xml");

        Response response = controller.convertSvgToPdf(List.of(emptyFile), false);

        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
    }

    @Test
    void convertSvgToPdf_singleSvgSuccess() throws Exception {
        byte[] svgContent = "<svg></svg>".getBytes();
        byte[] sanitizedSvg = "<svg>sanitized</svg>".getBytes();
        byte[] pdfBytes = "pdf-output".getBytes();
        byte[] processedPdf = "processed-pdf".getBytes();

        FileUpload svgFile = TestFileUploads.of(svgContent, "drawing.svg", "image/svg+xml");

        // FileUploadMultipartFile#getBytes() re-reads from disk, so the byte[] handed to the
        // sanitizer is a fresh copy (byte[] equality is identity) - match on type, not value.
        when(svgSanitizer.sanitize(any(byte[].class))).thenReturn(sanitizedSvg);
        when(pdfDocumentFactory.createNewBytesBasedOnOldDocument(pdfBytes))
                .thenReturn(processedPdf);

        Response expectedResponse = streamingOk(processedPdf);

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

            Response response = controller.convertSvgToPdf(List.of(svgFile), false);

            assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        }
    }

    @Test
    void convertSvgToPdf_combinedMode() throws Exception {
        byte[] svgContent1 = "<svg>1</svg>".getBytes();
        byte[] svgContent2 = "<svg>2</svg>".getBytes();
        byte[] sanitizedSvg = "<svg>s</svg>".getBytes();
        byte[] combinedPdf = "combined-pdf".getBytes();
        byte[] processedPdf = "processed-combined".getBytes();

        FileUpload svgFile1 = TestFileUploads.of(svgContent1, "a.svg", "image/svg+xml");
        FileUpload svgFile2 = TestFileUploads.of(svgContent2, "b.svg", "image/svg+xml");

        // Sanitizer output only feeds SvgToPdf.combineIntoPdf(any()), which ignores the value here.
        when(svgSanitizer.sanitize(any(byte[].class))).thenReturn(sanitizedSvg);
        when(pdfDocumentFactory.createNewBytesBasedOnOldDocument(combinedPdf))
                .thenReturn(processedPdf);

        Response expectedResponse = streamingOk(processedPdf);

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

            Response response = controller.convertSvgToPdf(List.of(svgFile1, svgFile2), true);

            assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        }
    }

    @Test
    void convertSvgToPdf_nullFilenameSkipped() {
        FileUpload nullNameFile = TestFileUploads.of("svg".getBytes(), null, "image/svg+xml");

        Response response = controller.convertSvgToPdf(List.of(nullNameFile), false);

        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
    }

    @Test
    void convertSvgToPdf_sanitizationFailureSkipsFile() throws IOException {
        byte[] svgContent = "<svg>bad</svg>".getBytes();
        FileUpload svgFile = TestFileUploads.of(svgContent, "bad.svg", "image/svg+xml");

        when(svgSanitizer.sanitize(any(byte[].class)))
                .thenThrow(new IOException("sanitization error"));

        Response response = controller.convertSvgToPdf(List.of(svgFile), false);

        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
    }
}
