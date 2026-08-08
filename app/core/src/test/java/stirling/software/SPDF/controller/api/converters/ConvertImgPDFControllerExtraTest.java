package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Path;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.rendering.ImageType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockedStatic;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.converters.ConvertToImageRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.PdfUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

/**
 * Extra branch coverage for {@link ConvertImgPDFController#convertToImage} not exercised by the
 * existing tests: the null-result logging branch, the octet-stream media-type fallback, and the
 * webp-with-Python path that produces no output files. The Python/ProcessExecutor boundary is
 * mocked so no interpreter or external binary ever runs.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("ConvertImgPDFController extra convertToImage branches")
class ConvertImgPDFControllerExtraTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @Mock private EndpointConfiguration endpointConfiguration;

    @InjectMocks private ConvertImgPDFController controller;

    private static byte[] tinyPdfBytes(int pages) throws IOException {
        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
            for (int i = 0; i < pages; i++) {
                doc.addPage(new PDPage(PDRectangle.A4));
            }
            doc.save(baos);
            return baos.toByteArray();
        }
    }

    private static PDDocument tinyDocument(int pages) {
        PDDocument doc = new PDDocument();
        for (int i = 0; i < pages; i++) {
            doc.addPage(new PDPage(PDRectangle.A4));
        }
        return doc;
    }

    private static MockMultipartFile pdfFile(byte[] bytes) {
        return new MockMultipartFile("fileInput", "source.pdf", "application/pdf", bytes);
    }

    private ConvertToImageRequest baseRequest(byte[] pdf, String format) {
        ConvertToImageRequest request = new ConvertToImageRequest();
        request.setFileInput(pdfFile(pdf));
        request.setImageFormat(format);
        request.setSingleOrMultiple("single");
        request.setColorType("color");
        request.setDpi(72);
        request.setPageNumbers("all");
        request.setIncludeAnnotations(false);
        return request;
    }

    @Nested
    @DisplayName("non-webp branches")
    class NonWebp {

        @Test
        @DisplayName("null render result still produces a single-image response")
        void nullResultStillResponds() throws Exception {
            byte[] pdfBytes = tinyPdfBytes(1);
            ConvertToImageRequest request = baseRequest(pdfBytes, "png");

            Mockito.when(pdfDocumentFactory.load(any(MockMultipartFile.class)))
                    .thenReturn(tinyDocument(1));

            @SuppressWarnings("unchecked")
            ResponseEntity<byte[]> expected = Mockito.mock(ResponseEntity.class);

            try (MockedStatic<PdfUtils> pu = Mockito.mockStatic(PdfUtils.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {

                // Null bytes hit the "resultant bytes is null" log branch but still respond.
                pu.when(
                                () ->
                                        PdfUtils.convertFromPdf(
                                                any(Path.class),
                                                eq("PNG"),
                                                eq(ImageType.RGB),
                                                eq(true),
                                                eq(72),
                                                any(String.class),
                                                eq(false)))
                        .thenReturn(null);
                wr.when(
                                () ->
                                        WebResponseUtils.bytesToWebResponse(
                                                any(), any(String.class), any(MediaType.class)))
                        .thenReturn(expected);

                ResponseEntity<?> response = controller.convertToImage(request);

                assertThat(response).isSameAs(expected);
            }
        }
    }

    @Nested
    @DisplayName("webp-with-Python branch")
    class WebpWithPython {

        @Test
        @DisplayName("webp format converts via PdfUtils without python dependency")
        void webpConvertsViaPdfUtils() throws Exception {
            byte[] pdfBytes = tinyPdfBytes(1);
            ConvertToImageRequest request = baseRequest(pdfBytes, "webp");

            Mockito.when(pdfDocumentFactory.load(any(MockMultipartFile.class)))
                    .thenReturn(tinyDocument(1));

            byte[] webpBytes = "webp-image".getBytes();
            @SuppressWarnings("unchecked")
            ResponseEntity<byte[]> expected = Mockito.mock(ResponseEntity.class);

            try (MockedStatic<PdfUtils> pu = Mockito.mockStatic(PdfUtils.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {

                pu.when(
                                () ->
                                        PdfUtils.convertFromPdf(
                                                any(Path.class),
                                                eq("WEBP"),
                                                any(ImageType.class),
                                                anyBoolean(),
                                                anyInt(),
                                                any(String.class),
                                                anyBoolean()))
                        .thenReturn(webpBytes);
                wr.when(
                                () ->
                                        WebResponseUtils.bytesToWebResponse(
                                                eq(webpBytes),
                                                any(String.class),
                                                any(MediaType.class)))
                        .thenReturn(expected);

                ResponseEntity<?> response = controller.convertToImage(request);

                assertThat(response).isSameAs(expected);
            }
        }
    }
}
