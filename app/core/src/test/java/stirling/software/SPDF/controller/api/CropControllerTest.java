package stirling.software.SPDF.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.general.CropPdfForm;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
@DisplayName("CropController")
class CropControllerTest {

    @TempDir Path tempDir;

    @Mock private TempFileManager tempFileManager;

    private CropController cropController;

    @BeforeEach
    void setUp() throws IOException {
        cropController = new CropController(tempFileManager);
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        invocation -> {
                            Path path =
                                    Files.createTempFile(
                                            tempDir, "crop-", invocation.<String>getArgument(0));
                            TempFile tempFile = mock(TempFile.class);
                            lenient().when(tempFile.getFile()).thenReturn(path.toFile());
                            lenient().when(tempFile.getPath()).thenReturn(path);
                            return tempFile;
                        });
    }

    @Test
    @DisplayName("plain crop sets every page box on the selected pages")
    void plainCropSetsEveryPageBoxOnSelectedPages() throws Exception {
        ResponseEntity<Resource> response = cropController.cropPdf(form(pdfWithBlocks(), false));

        byte[] cropped = body(response);
        try (PDDocument document = load(cropped)) {
            PDPage page = document.getPage(0);
            assertRect(page.getMediaBox(), 20f, 20f, 200f, 300f);
            assertRect(page.getCropBox(), 20f, 20f, 200f, 300f);
            assertRect(page.getTrimBox(), 20f, 20f, 200f, 300f);
            assertRect(page.getBleedBox(), 20f, 20f, 200f, 300f);
            assertRect(page.getArtBox(), 20f, 20f, 200f, 300f);
        }
    }

    @Test
    @DisplayName("removing outside content keeps text that crosses the crop edge")
    void removeDataOutsideCropPreservesBoundaryCrossingText() throws Exception {
        ResponseEntity<Resource> response = cropController.cropPdf(form(pdfWithBlocks(), true));

        String text;
        try (PDDocument document = load(body(response))) {
            text = new PDFTextStripper().getText(document);
        }

        assertThat(text).contains("Inside");
        assertThat(text).contains("BoundaryWord");
        assertThat(text).doesNotContain("OutsideWord");
    }

    @Test
    @DisplayName("auto-crop trims the blank margins and keeps the page content")
    void autoCropTrimsBlankMargins() throws Exception {
        MockMultipartFile file = pdfWithCentredText();
        CropPdfForm request = form(file, true);
        request.setAutoCrop(true);

        ResponseEntity<Resource> response = cropController.cropPdf(request);

        try (PDDocument document = load(body(response))) {
            assertThat(document.getNumberOfPages()).isEqualTo(1);
            PDRectangle mediaBox = document.getPage(0).getMediaBox();
            assertThat(mediaBox.getWidth()).isLessThan(PDRectangle.A4.getWidth());
            assertThat(mediaBox.getHeight()).isLessThan(PDRectangle.A4.getHeight());
            assertThat(mediaBox.getWidth()).isGreaterThan(0f);
            assertThat(mediaBox.getHeight()).isGreaterThan(0f);
            assertThat(new PDFTextStripper().getText(document)).contains("Centred");
        }
    }

    @Test
    @DisplayName("only the selected page is cropped")
    void pageSelectionOnlyCropsSelectedPages() throws Exception {
        CropPdfForm request = form(twoPagePdf(), false);
        request.setPageNumbers("2");

        ResponseEntity<Resource> response = cropController.cropPdf(request);

        try (PDDocument document = load(body(response))) {
            assertThat(document.getNumberOfPages()).isEqualTo(2);
            assertRect(
                    document.getPage(0).getMediaBox(),
                    0f,
                    0f,
                    PDRectangle.A4.getWidth(),
                    PDRectangle.A4.getHeight());
            assertRect(document.getPage(1).getMediaBox(), 20f, 20f, 200f, 300f);
        }
    }

    @Test
    @DisplayName("rejects zero or negative crop size")
    void rejectsNonPositiveCropSize() throws Exception {
        CropPdfForm request = form(pdfWithBlocks(), false);
        request.setWidth(0f);

        assertThatThrownBy(() -> cropController.cropPdf(request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("width and height must be greater than 0");
    }

    @Test
    @DisplayName("rejects missing coordinates")
    void rejectsMissingCoordinates() throws Exception {
        CropPdfForm request = form(pdfWithBlocks(), false);
        request.setX(null);

        assertThatThrownBy(() -> cropController.cropPdf(request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("coordinates");
    }

    @Test
    @DisplayName("rejects a page selection outside the document")
    void rejectsPageSelectionOutsideDocument() throws Exception {
        CropPdfForm request = form(pdfWithBlocks(), false);
        request.setPageNumbers("9");

        assertThatThrownBy(() -> cropController.cropPdf(request))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("wraps an unreadable PDF as a crop failure")
    void wrapsInvalidPdfAsCropFailure() {
        MockMultipartFile broken =
                new MockMultipartFile(
                        "fileInput",
                        "broken.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        new byte[] {1, 2, 3});
        CropPdfForm request = form(broken, true);

        assertThatThrownBy(() -> cropController.cropPdf(request))
                .isInstanceOf(IOException.class)
                .hasMessage("JPDFium crop failed")
                .hasCauseInstanceOf(RuntimeException.class);
    }

    @Test
    @DisplayName("keeps the original filename stem")
    void keepsOriginalFilenameStem() throws Exception {
        ResponseEntity<Resource> response = cropController.cropPdf(form(pdfWithBlocks(), false));

        assertThat(response.getHeaders().getContentDisposition().getFilename())
                .isEqualTo("blocks_cropped.pdf");
    }

    private CropPdfForm form(MockMultipartFile file, boolean removeDataOutsideCrop) {
        CropPdfForm request = new CropPdfForm();
        request.setFileInput(file);
        request.setX(20f);
        request.setY(20f);
        request.setWidth(200f);
        request.setHeight(300f);
        request.setAutoCrop(false);
        request.setRemoveDataOutsideCrop(removeDataOutsideCrop);
        return request;
    }

    private byte[] body(ResponseEntity<Resource> response) throws IOException {
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        return response.getBody().getInputStream().readAllBytes();
    }

    private PDDocument load(byte[] pdf) throws IOException {
        return org.apache.pdfbox.Loader.loadPDF(pdf);
    }

    private void assertRect(PDRectangle rect, float x, float y, float width, float height) {
        assertThat(rect.getLowerLeftX()).isEqualTo(x);
        assertThat(rect.getLowerLeftY()).isEqualTo(y);
        assertThat(rect.getWidth()).isEqualTo(width);
        assertThat(rect.getHeight()).isEqualTo(height);
    }

    private MockMultipartFile pdfWithBlocks() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.beginText();
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                content.newLineAtOffset(50, 200);
                content.showText("Inside");
                content.newLineAtOffset(140, 0);
                content.showText("BoundaryWord");
                content.newLineAtOffset(210, 0);
                content.showText("OutsideWord");
                content.endText();
            }
            return multipart(document, "blocks.pdf");
        }
    }

    private MockMultipartFile pdfWithCentredText() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.beginText();
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 18);
                content.newLineAtOffset(180, 380);
                content.showText("Centred");
                content.endText();
            }
            return multipart(document, "centred.pdf");
        }
    }

    private MockMultipartFile twoPagePdf() throws IOException {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage(PDRectangle.A4));
            PDPage second = new PDPage(PDRectangle.A4);
            document.addPage(second);
            try (PDPageContentStream content = new PDPageContentStream(document, second)) {
                content.beginText();
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                content.newLineAtOffset(50, 200);
                content.showText("Second page");
                content.endText();
            }
            return multipart(document, "two-pages.pdf");
        }
    }

    private MockMultipartFile multipart(PDDocument document, String filename) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        document.save(out);
        return new MockMultipartFile(
                "fileInput", filename, MediaType.APPLICATION_PDF_VALUE, out.toByteArray());
    }
}
