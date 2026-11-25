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
 * Where a page label ends up on the page as a reader sees it, found by rendering the output: the
 * renderer applies the page's rotation and crop box the way a viewer does.
 */
@ExtendWith(MockitoExtension.class)
class PageNumbersControllerPlacementTest {

    // An "L" looks different in each of its four orientations, so its pixels show which way up it
    // is drawn. A number such as "1" looks much the same upside down.
    private static final String LABEL = "L";

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
            assertLabelShownAt(position, rotation, null);
        }
    }

    @ParameterizedTest(name = "page rotated {0} degrees")
    @ValueSource(ints = {0, 90, 180, 270})
    @DisplayName("Each position stays inside the visible area of a cropped page")
    void positionsFollowCropBox(int rotation) throws Exception {
        PDRectangle cropBox = new PDRectangle(100, 300, 300, 400);
        for (int position = 1; position <= 9; position++) {
            assertLabelShownAt(position, rotation, cropBox);
        }
    }

    private void assertLabelShownAt(int position, int rotation, PDRectangle cropBox)
            throws Exception {
        Ink ink = labelAndRender(singlePagePdf(PDRectangle.LETTER, rotation, cropBox), position);
        String where = "position " + position + " on a page rotated " + rotation;
        assertThat(ink).as("label is visible for %s", where).isNotNull();
        assertThat(ink.column()).as("column for %s", where).isEqualTo((position - 1) % 3);
        assertThat(ink.row()).as("row for %s", where).isEqualTo((position - 1) / 3);
        assertThat(ink.isUprightL()).as("reads upright for %s", where).isTrue();

        PDRectangle displayed = new PDRectangle(ink.page().getWidth(), ink.page().getHeight());
        Ink onPlainPage = labelAndRender(singlePagePdf(displayed, 0, null), position);
        assertThat(ink.farthestEdgeFrom(onPlainPage))
                .as("pixels away from a plain page of the same shape for %s", where)
                .isLessThanOrEqualTo(2);
    }

    private Ink labelAndRender(MockMultipartFile file, int position) throws Exception {
        AddPageNumbersRequest request = new AddPageNumbersRequest();
        request.setFileInput(file);
        request.setFontSize(36f);
        request.setFontType("helvetica");
        request.setStartingNumber(1);
        request.setCustomText(LABEL);
        request.setPosition(position);
        when(pdfDocumentFactory.load(file)).thenReturn(Loader.loadPDF(file.getBytes()));

        ResponseEntity<Resource> response = controller.addPageNumbers(request);

        byte[] labelled;
        try (InputStream body = response.getBody().getInputStream()) {
            labelled = body.readAllBytes();
        }
        try (PDDocument output = Loader.loadPDF(labelled)) {
            return Ink.find(new PDFRenderer(output).renderImage(0));
        }
    }

    private static MockMultipartFile singlePagePdf(
            PDRectangle mediaBox, int rotation, PDRectangle cropBox) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(mediaBox);
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
    private record Ink(BufferedImage page, int left, int top, int right, int bottom) {

        /** Null when the page is blank. */
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
            return right < 0 ? null : new Ink(page, left, top, right, bottom);
        }

        /** Third of the page the box is centred in: 0 left, 1 middle, 2 right. */
        int column() {
            return (left + right) * 3 / (2 * page.getWidth());
        }

        /** Third of the page the box is centred in: 0 top, 1 middle, 2 bottom. */
        int row() {
            return (top + bottom) * 3 / (2 * page.getHeight());
        }

        /** An upright "L" is taller than wide, with its stem on the left and its foot below. */
        boolean isUprightL() {
            int middleX = (left + right) / 2;
            int middleY = (top + bottom) / 2;
            return bottom - top > right - left
                    && inked(left, top, middleX, bottom) > inked(middleX + 1, top, right, bottom)
                    && inked(left, middleY + 1, right, bottom) > inked(left, top, right, middleY);
        }

        /** Largest gap, in pixels, between an edge of this box and the same edge of another. */
        int farthestEdgeFrom(Ink other) {
            return Math.max(
                    Math.max(Math.abs(left - other.left), Math.abs(top - other.top)),
                    Math.max(Math.abs(right - other.right), Math.abs(bottom - other.bottom)));
        }

        private int inked(int fromX, int fromY, int toX, int toY) {
            int pixels = 0;
            for (int y = fromY; y <= toY; y++) {
                for (int x = fromX; x <= toX; x++) {
                    if (page.getRGB(x, y) != Color.WHITE.getRGB()) {
                        pixels++;
                    }
                }
            }
            return pixels;
        }
    }
}
