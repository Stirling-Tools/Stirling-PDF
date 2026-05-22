package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.general.ScalePagesRequest;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
@Tag("integration")
class ScalePagesControllerTest {

    private static byte[] drainBody(ResponseEntity<Resource> response) throws IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        try (java.io.InputStream in = response.getBody().getInputStream()) {
            in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    @TempDir Path tempDir;
    @Mock private TempFileManager tempFileManager;
    @InjectMocks private ScalePagesController controller;

    @BeforeEach
    void setUp() throws Exception {
        lenient()
                .when(tempFileManager.convertMultipartFileToFile(any(MultipartFile.class)))
                .thenAnswer(
                        inv -> {
                            MultipartFile mf = inv.getArgument(0);
                            File f = Files.createTempFile("scale-in", ".pdf").toFile();
                            Files.write(f.toPath(), mf.getBytes());
                            return f;
                        });
        lenient()
                .when(tempFileManager.createTempFile(anyString()))
                .thenAnswer(inv -> Files.createTempFile("scale-out", inv.getArgument(0)).toFile());
    }

    // PDFium TransFormWithClip requires each page to have a content stream; add a
    // sentinel character on every page so the test fixtures are not empty.
    private MockMultipartFile createRealPdf(PDRectangle pageSize, int numPages) throws IOException {
        PDType1Font helv = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < numPages; i++) {
                PDPage page = new PDPage(pageSize);
                doc.addPage(page);
                try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                    cs.beginText();
                    cs.setFont(helv, 12);
                    cs.newLineAtOffset(50, pageSize.getHeight() - 50);
                    cs.showText("X");
                    cs.endText();
                }
            }
            Path pdfPath = tempDir.resolve("input-" + System.nanoTime() + ".pdf");
            doc.save(pdfPath.toFile());
            return new MockMultipartFile(
                    "fileInput",
                    "test.pdf",
                    MediaType.APPLICATION_PDF_VALUE,
                    Files.readAllBytes(pdfPath));
        }
    }

    private ScalePagesRequest buildRequest(MockMultipartFile file, String size, float factor) {
        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(file);
        request.setPageSize(size);
        request.setScaleFactor(factor);
        return request;
    }

    @Test
    void testScalePages_A4ToA3() throws Exception {
        MockMultipartFile file = createRealPdf(PDRectangle.A4, 1);
        ResponseEntity<Resource> response = controller.scalePages(buildRequest(file, "A3", 1.0f));

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        try (PDDocument out = Loader.loadPDF(drainBody(response))) {
            assertThat(out.getNumberOfPages()).isEqualTo(1);
            PDRectangle mb = out.getPage(0).getMediaBox();
            assertThat(mb.getWidth()).isCloseTo(PDRectangle.A3.getWidth(), within(0.5f));
            assertThat(mb.getHeight()).isCloseTo(PDRectangle.A3.getHeight(), within(0.5f));
        }
    }

    @Test
    void testScalePages_KeepSize() throws Exception {
        MockMultipartFile file = createRealPdf(PDRectangle.A4, 2);
        ResponseEntity<Resource> response = controller.scalePages(buildRequest(file, "KEEP", 1.0f));

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        try (PDDocument out = Loader.loadPDF(drainBody(response))) {
            assertThat(out.getNumberOfPages()).isEqualTo(2);
            PDRectangle mb = out.getPage(0).getMediaBox();
            assertThat(mb.getWidth()).isCloseTo(PDRectangle.A4.getWidth(), within(0.5f));
            assertThat(mb.getHeight()).isCloseTo(PDRectangle.A4.getHeight(), within(0.5f));
        }
    }

    @Test
    void testScalePages_WithScaleFactor() throws Exception {
        MockMultipartFile file = createRealPdf(PDRectangle.A4, 1);
        ResponseEntity<Resource> response = controller.scalePages(buildRequest(file, "A4", 0.5f));

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        try (PDDocument out = Loader.loadPDF(drainBody(response))) {
            // Page size stays A4; content is scaled by 0.5x and centered.
            PDRectangle mb = out.getPage(0).getMediaBox();
            assertThat(mb.getWidth()).isCloseTo(PDRectangle.A4.getWidth(), within(0.5f));
            assertThat(mb.getHeight()).isCloseTo(PDRectangle.A4.getHeight(), within(0.5f));
        }
    }

    @Test
    void testScalePages_Letter() throws Exception {
        MockMultipartFile file = createRealPdf(PDRectangle.A4, 1);
        ResponseEntity<Resource> response =
                controller.scalePages(buildRequest(file, "LETTER", 1.0f));

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        try (PDDocument out = Loader.loadPDF(drainBody(response))) {
            PDRectangle mb = out.getPage(0).getMediaBox();
            assertThat(mb.getWidth()).isCloseTo(PDRectangle.LETTER.getWidth(), within(0.5f));
            assertThat(mb.getHeight()).isCloseTo(PDRectangle.LETTER.getHeight(), within(0.5f));
        }
    }

    @Test
    void testScalePages_Legal() throws Exception {
        MockMultipartFile file = createRealPdf(PDRectangle.A4, 1);
        ResponseEntity<Resource> response =
                controller.scalePages(buildRequest(file, "LEGAL", 1.0f));

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        try (PDDocument out = Loader.loadPDF(drainBody(response))) {
            PDRectangle mb = out.getPage(0).getMediaBox();
            assertThat(mb.getWidth()).isCloseTo(PDRectangle.LEGAL.getWidth(), within(0.5f));
            assertThat(mb.getHeight()).isCloseTo(PDRectangle.LEGAL.getHeight(), within(0.5f));
        }
    }

    @Test
    void testScalePages_InvalidPageSize() throws Exception {
        MockMultipartFile file = createRealPdf(PDRectangle.A4, 1);
        ScalePagesRequest request = buildRequest(file, "INVALID_SIZE", 1.0f);

        assertThatThrownBy(() -> controller.scalePages(request))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void testScalePages_MultiplePages() throws Exception {
        MockMultipartFile file = createRealPdf(PDRectangle.A4, 5);
        ResponseEntity<Resource> response = controller.scalePages(buildRequest(file, "A5", 1.0f));

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        try (PDDocument out = Loader.loadPDF(drainBody(response))) {
            assertThat(out.getNumberOfPages()).isEqualTo(5);
            for (int i = 0; i < 5; i++) {
                PDRectangle mb = out.getPage(i).getMediaBox();
                assertThat(mb.getWidth()).isCloseTo(PDRectangle.A5.getWidth(), within(0.5f));
                assertThat(mb.getHeight()).isCloseTo(PDRectangle.A5.getHeight(), within(0.5f));
            }
        }
    }

    @Test
    void testScalePages_LandscapeSize() throws Exception {
        MockMultipartFile file = createRealPdf(PDRectangle.A4, 1);
        ResponseEntity<Resource> response =
                controller.scalePages(buildRequest(file, "A4_LANDSCAPE", 1.0f));

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        try (PDDocument out = Loader.loadPDF(drainBody(response))) {
            PDRectangle mb = out.getPage(0).getMediaBox();
            assertThat(mb.getWidth()).isCloseTo(PDRectangle.A4.getHeight(), within(0.5f));
            assertThat(mb.getHeight()).isCloseTo(PDRectangle.A4.getWidth(), within(0.5f));
        }
    }

    @Test
    void testScalePages_KeepWithEmptyDoc() throws Exception {
        Path pdfPath = tempDir.resolve("empty.pdf");
        try (PDDocument doc = new PDDocument()) {
            doc.save(pdfPath.toFile());
        }
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput",
                        "empty.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        Files.readAllBytes(pdfPath));
        ScalePagesRequest request = buildRequest(file, "KEEP", 1.0f);

        assertThatThrownBy(() -> controller.scalePages(request))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void testScalePages_A0Size() throws Exception {
        MockMultipartFile file = createRealPdf(PDRectangle.A4, 1);
        ResponseEntity<Resource> response = controller.scalePages(buildRequest(file, "A0", 1.0f));

        assertThat(response.getStatusCode().value()).isEqualTo(200);
        try (PDDocument out = Loader.loadPDF(drainBody(response))) {
            PDRectangle mb = out.getPage(0).getMediaBox();
            assertThat(mb.getWidth()).isCloseTo(PDRectangle.A0.getWidth(), within(0.5f));
            assertThat(mb.getHeight()).isCloseTo(PDRectangle.A0.getHeight(), within(0.5f));
        }
    }
}
