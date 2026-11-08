package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.general.CropPdfForm;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

/**
 * Additional branch coverage for {@link CropController}: the JPDFium routing decision (removeData
 * runs the content-removing crop regardless of Ghostscript availability), the per-page selection
 * behavior of the JPDFium path, and the large-image sampling-step branch of detectContentBounds.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("CropController additional branch tests")
class CropControllerMoreTest {

    @TempDir Path tempDir;
    @Mock private TempFileManager tempFileManager;
    @InjectMocks private CropController cropController;

    @BeforeEach
    void setUp() throws Exception {
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile(
                                                    tempDir, "crop", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            lenient().when(tf.getAbsolutePath()).thenReturn(f.getAbsolutePath());
                            return tf;
                        });
    }

    private MockMultipartFile pdfWithBoundaryText() throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(doc, page)) {
                content.beginText();
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                content.newLineAtOffset(50, 200);
                content.showText("Inside");
                content.newLineAtOffset(140, 0);
                content.showText("BoundaryWord");
                content.endText();
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return new MockMultipartFile(
                    "fileInput", "boundary.pdf", "application/pdf", out.toByteArray());
        }
    }

    private MockMultipartFile pdfWithBoundaryImage() throws IOException {
        BufferedImage image = new BufferedImage(200, 200, BufferedImage.TYPE_INT_RGB);
        for (int x = 0; x < image.getWidth(); x++) {
            for (int y = 0; y < image.getHeight(); y++) {
                image.setRGB(x, y, 0xFF3366);
            }
        }
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        ImageIO.write(image, "png", png);

        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            PDImageXObject imageXObject =
                    PDImageXObject.createFromByteArray(doc, png.toByteArray(), "boundary");
            try (PDPageContentStream content = new PDPageContentStream(doc, page)) {
                // Crop rect is (100,100)-(400,400): half of the image lies outside.
                content.drawImage(imageXObject, 300, 300, 200, 200);
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return new MockMultipartFile(
                    "fileInput", "boundary-image.pdf", "application/pdf", out.toByteArray());
        }
    }

    private MockMultipartFile pdfWithSharedBoundaryImage() throws IOException {
        BufferedImage image = new BufferedImage(200, 200, BufferedImage.TYPE_INT_RGB);
        for (int x = 0; x < image.getWidth(); x++) {
            for (int y = 0; y < image.getHeight(); y++) {
                image.setRGB(x, y, 0xFF6633);
            }
        }
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        ImageIO.write(image, "png", png);

        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            PDImageXObject imageXObject =
                    PDImageXObject.createFromByteArray(doc, png.toByteArray(), "shared");
            try (PDPageContentStream content = new PDPageContentStream(doc, page)) {
                // Both placements use the same image data and cross the crop edge.
                content.drawImage(imageXObject, 250, 250, 200, 200);
                content.drawImage(imageXObject, 50, 50, 200, 200);
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return new MockMultipartFile(
                    "fileInput", "shared-boundary-image.pdf", "application/pdf", out.toByteArray());
        }
    }

    private MockMultipartFile pdf(int pages) throws IOException {
        Path p = tempDir.resolve("crop-src.pdf");
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < pages; i++) {
                doc.addPage(new PDPage(PDRectangle.LETTER));
            }
            doc.save(p.toFile());
        }
        return new MockMultipartFile(
                "fileInput", "src.pdf", MediaType.APPLICATION_PDF_VALUE, Files.readAllBytes(p));
    }

    private CropPdfForm form(MockMultipartFile file, boolean removeOutside) {
        CropPdfForm f = new CropPdfForm();
        f.setFileInput(file);
        f.setX(20f);
        f.setY(20f);
        f.setWidth(200f);
        f.setHeight(300f);
        f.setAutoCrop(false);
        f.setRemoveDataOutsideCrop(removeOutside);
        return f;
    }

    private static void assertRect(
            PDRectangle actual, float x, float y, float width, float height) {
        // PDRectangle does not override equals, so compare components.
        assertThat(actual.getLowerLeftX()).isEqualTo(x);
        assertThat(actual.getLowerLeftY()).isEqualTo(y);
        assertThat(actual.getWidth()).isEqualTo(width);
        assertThat(actual.getHeight()).isEqualTo(height);
    }

    @Nested
    @DisplayName("JPDFium routing")
    class JpdfiumRouting {

        @Test
        @DisplayName("removeDataOutsideCrop runs the JPDFium path, not the PDFBox path")
        void removeDataRunsJpdfium() throws Exception {
            MockMultipartFile file = pdf(3);
            CropPdfForm request = form(file, true);

            ResponseEntity<Resource> response = cropController.cropPdf(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isNotNull();
            byte[] body = response.getBody().getInputStream().readAllBytes();
            try (PDDocument out = Loader.loadPDF(body)) {
                assertThat(out.getNumberOfPages()).isEqualTo(3);
                // All pages selected: every page hard-cropped to the request rect.
                for (int i = 0; i < 3; i++) {
                    assertRect(out.getPage(i).getMediaBox(), 20f, 20f, 200f, 300f);
                }
            }
        }

        @Test
        @DisplayName("JPDFium crops only selected pages and leaves the rest pristine")
        void jpdfiumKeepsUnselectedPagesPristine() throws Exception {
            MockMultipartFile file = pdf(3);
            CropPdfForm request = form(file, true);
            request.setPageNumbers("2");

            ResponseEntity<Resource> response = cropController.cropPdf(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isNotNull();
            byte[] body = response.getBody().getInputStream().readAllBytes();
            try (PDDocument out = Loader.loadPDF(body)) {
                assertThat(out.getNumberOfPages()).isEqualTo(3);
                assertRect(out.getPage(1).getMediaBox(), 20f, 20f, 200f, 300f);
                assertRect(out.getPage(0).getMediaBox(), 0f, 0f, 612f, 792f);
                assertRect(out.getPage(2).getMediaBox(), 0f, 0f, 612f, 792f);
            }
        }

        @Test
        @DisplayName("boundary-crossing text survives the crop")
        void boundaryTextIsPreserved() throws Exception {
            MockMultipartFile file = pdfWithBoundaryText();
            CropPdfForm request = form(file, true);

            ResponseEntity<Resource> response = cropController.cropPdf(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isNotNull();
            byte[] body = response.getBody().getInputStream().readAllBytes();
            try (PDDocument out = Loader.loadPDF(body)) {
                String text = new PDFTextStripper().getText(out);
                assertThat(text).contains("Inside");
                assertThat(text).contains("BoundaryWord");
            }
        }

        @Test
        @DisplayName("image crossing the crop edge is preserved without failing")
        void boundaryImageIsPreserved() throws Exception {
            MockMultipartFile file = pdfWithBoundaryImage();
            CropPdfForm request = form(file, true);
            request.setX(100f);
            request.setY(100f);
            request.setWidth(300f);
            request.setHeight(300f);

            ResponseEntity<Resource> response = cropController.cropPdf(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isNotNull();
            byte[] body = response.getBody().getInputStream().readAllBytes();
            try (PDDocument out = Loader.loadPDF(body)) {
                assertRect(out.getPage(0).getMediaBox(), 100f, 100f, 300f, 300f);
                assertThat(out.getPage(0).getResources().getXObjectNames()).isNotEmpty();
            }
        }

        @Test
        @DisplayName("shared image crossing the crop edge is preserved without failing")
        void sharedBoundaryImageIsPreserved() throws Exception {
            MockMultipartFile file = pdfWithSharedBoundaryImage();
            CropPdfForm request = form(file, true);
            request.setX(100f);
            request.setY(100f);
            request.setWidth(300f);
            request.setHeight(300f);

            ResponseEntity<Resource> response = cropController.cropPdf(request);

            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(response.getBody()).isNotNull();
            byte[] body = response.getBody().getInputStream().readAllBytes();
            try (PDDocument out = Loader.loadPDF(body)) {
                assertRect(out.getPage(0).getMediaBox(), 100f, 100f, 300f, 300f);
                assertThat(out.getPage(0).getResources().getXObjectNames()).isNotEmpty();
            }
        }

        @Test
        @DisplayName("JPDFium failure is wrapped and surfaced as IOException")
        void jpdfiumFailureIsWrapped() {
            MockMultipartFile file =
                    new MockMultipartFile(
                            "fileInput",
                            "broken.pdf",
                            MediaType.APPLICATION_PDF_VALUE,
                            new byte[] {1, 2, 3});
            CropPdfForm request = form(file, true);

            assertThatThrownBy(() -> cropController.cropPdf(request))
                    .isInstanceOf(IOException.class)
                    .hasMessage("JPDFium crop failed")
                    .hasCauseInstanceOf(RuntimeException.class);
        }
    }

    @Nested
    @DisplayName("detectContentBounds sampling step")
    class SamplingStep {

        private Method detect;

        @BeforeEach
        void setUp() throws Exception {
            detect =
                    CropController.class.getDeclaredMethod(
                            "detectContentBounds", BufferedImage.class);
            detect.setAccessible(true);
        }

        @Test
        @DisplayName("large images (>2000px) use a step of 2 and still locate content")
        void largeImageUsesStep2() throws Exception {
            // Width > 2000 triggers the step=2 sampling branch.
            BufferedImage image = new BufferedImage(2100, 50, BufferedImage.TYPE_INT_RGB);
            for (int x = 0; x < 2100; x++) {
                for (int y = 0; y < 50; y++) {
                    image.setRGB(x, y, 0xFFFFFF);
                }
            }
            // Dark block on even coordinates so the step-2 scan can see it.
            for (int x = 1000; x < 1040; x += 2) {
                for (int y = 10; y < 30; y += 2) {
                    image.setRGB(x, y, 0x000000);
                }
            }

            int[] bounds = (int[]) detect.invoke(null, image);
            assertThat(bounds).hasSize(4);
            assertThat(bounds[0]).isGreaterThanOrEqualTo(0);
            assertThat(bounds[2]).isGreaterThan(bounds[0]);
        }

        @Test
        @DisplayName("zero-size image returns degenerate bounds")
        void zeroSizeImage() throws Exception {
            BufferedImage image = new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB);
            image.setRGB(0, 0, 0xFFFFFF);
            int[] bounds = (int[]) detect.invoke(null, image);
            assertThat(bounds).containsExactly(0, 0, 0, 0);
        }
    }
}
