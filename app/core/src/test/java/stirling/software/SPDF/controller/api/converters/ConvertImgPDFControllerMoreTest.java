package stirling.software.SPDF.controller.api.converters;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.lang.reflect.Method;

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
import stirling.software.SPDF.model.api.converters.ConvertToPdfRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.GeneralUtils;
import stirling.software.common.util.PdfUtils;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;

/**
 * Additional branch coverage for {@link ConvertImgPDFController}: the getMediaType fallback, the
 * convertToPdf null/blank colorType and fitOption defaults, multi-image input, and the explicit
 * page-selection path of convertToImage. The PdfUtils boundary is mocked so no real rendering or
 * external binary runs.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("ConvertImgPDFController additional branch tests")
class ConvertImgPDFControllerMoreTest {

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

    private static PDDocument tinyDoc(int pages) {
        PDDocument doc = new PDDocument();
        for (int i = 0; i < pages; i++) {
            doc.addPage(new PDPage(PDRectangle.A4));
        }
        return doc;
    }

    @Nested
    @DisplayName("getMediaType")
    class GetMediaType {

        private String invoke(String format) throws Exception {
            Method m =
                    ConvertImgPDFController.class.getDeclaredMethod("getMediaType", String.class);
            m.setAccessible(true);
            return (String) m.invoke(controller, format);
        }

        @Test
        @DisplayName("known image extension resolves to a concrete mime type")
        void knownExtension() throws Exception {
            assertThat(invoke("png")).isEqualTo("image/png");
        }

        @Test
        @DisplayName("unknown extension does not resolve to a concrete image mime type")
        void unknownExtensionNotConcrete() throws Exception {
            // guessContentTypeFromName yields null/octet-stream for an unrecognised extension;
            // either way it must not masquerade as a real image type.
            String result = invoke("zzz");
            assertThat(result).isNotEqualTo("image/png");
        }
    }

    @Nested
    @DisplayName("convertToPdf defaults")
    class ConvertToPdfDefaults {

        @Test
        @DisplayName("blank colorType and empty fitOption fall back to color/fillPage")
        void blankDefaults() throws Exception {
            MockMultipartFile img =
                    new MockMultipartFile("fileInput", "p.jpg", "image/jpeg", "x".getBytes());
            ConvertToPdfRequest request = new ConvertToPdfRequest();
            request.setFileInput(new MockMultipartFile[] {img});
            request.setColorType("   ");
            request.setFitOption("");
            request.setAutoRotate(null);

            byte[] pdfBytes = "pdf".getBytes();
            ResponseEntity<byte[]> expected = ResponseEntity.ok(pdfBytes);

            try (MockedStatic<PdfUtils> pu = Mockito.mockStatic(PdfUtils.class);
                    MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {

                pu.when(
                                () ->
                                        PdfUtils.imageToPdf(
                                                any(MockMultipartFile[].class),
                                                eq("fillPage"),
                                                eq(false),
                                                eq("color"),
                                                eq(pdfDocumentFactory)))
                        .thenReturn(pdfBytes);
                gu.when(() -> GeneralUtils.generateFilename("p.jpg", "_converted.pdf"))
                        .thenReturn("p_converted.pdf");
                wr.when(() -> WebResponseUtils.bytesToWebResponse(pdfBytes, "p_converted.pdf"))
                        .thenReturn(expected);

                ResponseEntity<byte[]> response = controller.convertToPdf(request);

                assertThat(response).isSameAs(expected);
                // Blank colorType -> "color"; empty fitOption -> "fillPage".
                pu.verify(
                        () ->
                                PdfUtils.imageToPdf(
                                        any(MockMultipartFile[].class),
                                        eq("fillPage"),
                                        eq(false),
                                        eq("color"),
                                        eq(pdfDocumentFactory)));
            }
        }

        @Test
        @DisplayName("multiple images use the first filename for the output")
        void multipleImagesUseFirstName() throws Exception {
            MockMultipartFile a =
                    new MockMultipartFile("fileInput", "first.png", "image/png", "a".getBytes());
            MockMultipartFile b =
                    new MockMultipartFile("fileInput", "second.png", "image/png", "b".getBytes());
            ConvertToPdfRequest request = new ConvertToPdfRequest();
            request.setFileInput(new MockMultipartFile[] {a, b});
            request.setColorType("color");
            request.setFitOption("fillPage");
            request.setAutoRotate(false);

            byte[] pdfBytes = "pdf".getBytes();
            ResponseEntity<byte[]> expected = ResponseEntity.ok(pdfBytes);

            try (MockedStatic<PdfUtils> pu = Mockito.mockStatic(PdfUtils.class);
                    MockedStatic<GeneralUtils> gu = Mockito.mockStatic(GeneralUtils.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {

                pu.when(
                                () ->
                                        PdfUtils.imageToPdf(
                                                any(MockMultipartFile[].class),
                                                eq("fillPage"),
                                                eq(false),
                                                eq("color"),
                                                eq(pdfDocumentFactory)))
                        .thenReturn(pdfBytes);
                gu.when(() -> GeneralUtils.generateFilename("first.png", "_converted.pdf"))
                        .thenReturn("first_converted.pdf");
                wr.when(() -> WebResponseUtils.bytesToWebResponse(pdfBytes, "first_converted.pdf"))
                        .thenReturn(expected);

                ResponseEntity<byte[]> response = controller.convertToPdf(request);

                assertThat(response).isSameAs(expected);
                gu.verify(() -> GeneralUtils.generateFilename("first.png", "_converted.pdf"));
            }
        }
    }

    @Nested
    @DisplayName("convertToImage explicit page selection")
    class ExplicitPages {

        @Test
        @DisplayName("a specific page-number list is parsed and rendered")
        void specificPageList() throws Exception {
            byte[] pdfBytes = tinyPdfBytes(3);
            MockMultipartFile file =
                    new MockMultipartFile("fileInput", "src.pdf", "application/pdf", pdfBytes);

            ConvertToImageRequest request = new ConvertToImageRequest();
            request.setFileInput(file);
            request.setImageFormat("png");
            request.setSingleOrMultiple("single");
            request.setColorType("color");
            request.setDpi(72);
            request.setPageNumbers("1,3");
            request.setIncludeAnnotations(false);

            // rearrangePdfPages loads a real document and selects pages 1 and 3.
            Mockito.when(pdfDocumentFactory.load(any(MockMultipartFile.class)))
                    .thenReturn(tinyDoc(3));

            byte[] imageBytes = "img".getBytes();
            ResponseEntity<byte[]> expected = ResponseEntity.ok(imageBytes);

            try (MockedStatic<PdfUtils> pu = Mockito.mockStatic(PdfUtils.class);
                    MockedStatic<WebResponseUtils> wr =
                            Mockito.mockStatic(WebResponseUtils.class)) {

                pu.when(
                                () ->
                                        PdfUtils.convertFromPdf(
                                                eq(pdfDocumentFactory),
                                                any(byte[].class),
                                                eq("PNG"),
                                                eq(ImageType.RGB),
                                                eq(true),
                                                eq(72),
                                                any(String.class),
                                                eq(false)))
                        .thenReturn(imageBytes);
                wr.when(
                                () ->
                                        WebResponseUtils.bytesToWebResponse(
                                                eq(imageBytes),
                                                any(String.class),
                                                any(MediaType.class)))
                        .thenReturn(expected);

                ResponseEntity<?> response = controller.convertToImage(request);

                assertThat(response).isSameAs(expected);
            }
        }
    }
}
