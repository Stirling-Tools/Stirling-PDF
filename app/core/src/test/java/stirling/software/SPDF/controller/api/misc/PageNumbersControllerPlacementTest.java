package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.model.api.misc.AddPageNumbersRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

/**
 * Where a page number ends up on the page as a reader sees it, found by rendering the output: the
 * renderer applies the page's rotation and crop box the way a viewer does.
 */
@ExtendWith(MockitoExtension.class)
class PageNumbersControllerPlacementTest {

    // "000001" is wider than it is tall only while it reads upright.
    private static final int ZERO_PAD = 6;

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;

    @InjectMocks private PageNumbersController controller;

    @BeforeEach
    void setUp() throws Exception {
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            File f =
                                    Files.createTempFile(
                                                    "pgnum-placement", inv.<String>getArgument(0))
                                            .toFile();
                            f.deleteOnExit();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            return tf;
                        });
    }

    @ParameterizedTest(name = "page rotated {0} degrees")
    @ValueSource(ints = {0, 90, 180, 270})
    @DisplayName("Each position lands in its cell of the displayed page, reading upright")
    void positionsFollowPageRotation(int rotation) throws Exception {
        for (int position = 1; position <= 9; position++) {
            assertNumberShownAt(position, rotation, null);
        }
    }

    @ParameterizedTest(name = "page rotated {0} degrees")
    @ValueSource(ints = {0, 90, 180, 270})
    @DisplayName("Each position stays inside the visible area of a cropped page")
    void positionsFollowCropBox(int rotation) throws Exception {
        PDRectangle cropBox = new PDRectangle(100, 300, 300, 400);
        for (int position = 1; position <= 9; position++) {
            assertNumberShownAt(position, rotation, cropBox);
        }
    }

    private void assertNumberShownAt(int position, int rotation, PDRectangle cropBox)
            throws Exception {
        MockMultipartFile file = singlePagePdf(rotation, cropBox);
        AddPageNumbersRequest request = new AddPageNumbersRequest();
        request.setFileInput(file);
        request.setFontSize(12f);
        request.setFontType("helvetica");
        request.setStartingNumber(1);
        request.setZeroPad(ZERO_PAD);
        request.setPosition(position);
        when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

        ResponseEntity<Resource> response = controller.addPageNumbers(request);

        byte[] numbered;
        try (InputStream body = response.getBody().getInputStream()) {
            numbered = body.readAllBytes();
        }
        try (PDDocument output = Loader.loadPDF(numbered)) {
            BufferedImage shown = new PDFRenderer(output).renderImage(0);
            Ink ink = Ink.find(shown);
            String where = "position " + position + " on a page rotated " + rotation;
            assertThat(ink).as("number is visible for %s", where).isNotNull();
            assertThat(ink.column(shown)).as("column for %s", where).isEqualTo((position - 1) % 3);
            assertThat(ink.row(shown)).as("row for %s", where).isEqualTo((position - 1) / 3);
            assertThat(ink.width()).as("reads upright for %s", where).isGreaterThan(ink.height());
        }
    }

    private static MockMultipartFile singlePagePdf(int rotation, PDRectangle cropBox)
            throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            page.setRotation(rotation);
            if (cropBox != null) {
                page.setCropBox(cropBox);
            }
            doc.addPage(page);
            doc.save(bytes);
        }
        return new MockMultipartFile(
                "fileInput", "page.pdf", MediaType.APPLICATION_PDF_VALUE, bytes.toByteArray());
    }

    /** Bounding box, in pixels, of everything drawn on an otherwise blank white page. */
    private record Ink(int left, int top, int right, int bottom) {

        static Ink find(BufferedImage page) {
            int left = Integer.MAX_VALUE;
            int top = Integer.MAX_VALUE;
            int right = -1;
            int bottom = -1;
            for (int y = 0; y < page.getHeight(); y++) {
                for (int x = 0; x < page.getWidth(); x++) {
                    if (page.getRGB(x, y) != Color.WHITE.getRGB()) {
                        left = Math.min(left, x);
                        top = Math.min(top, y);
                        right = Math.max(right, x);
                        bottom = Math.max(bottom, y);
                    }
                }
            }
            return right < 0 ? null : new Ink(left, top, right, bottom);
        }

        int width() {
            return right - left + 1;
        }

        int height() {
            return bottom - top + 1;
        }

        /** Third of the page the box is centred in: 0 left, 1 middle, 2 right. */
        int column(BufferedImage page) {
            return (left + right) * 3 / (2 * page.getWidth());
        }

        /** Third of the page the box is centred in: 0 top, 1 middle, 2 bottom. */
        int row(BufferedImage page) {
            return (top + bottom) * 3 / (2 * page.getHeight());
        }
    }
}
