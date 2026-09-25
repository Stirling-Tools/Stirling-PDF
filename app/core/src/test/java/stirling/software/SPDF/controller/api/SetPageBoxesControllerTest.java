package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
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

import stirling.software.SPDF.model.api.general.SetPageBoxesRequest;
import stirling.software.common.model.api.PDFFile;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class SetPageBoxesControllerTest {

    private static final float MM = 72f / 25.4f;

    private static byte[] drainBody(ResponseEntity<Resource> response) throws IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        try (java.io.InputStream in = response.getBody().getInputStream()) {
            in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    private static void assertRectEquals(
            float x, float y, float width, float height, PDRectangle rect) {
        assertNotNull(rect);
        assertEquals(x, rect.getLowerLeftX(), 0.01);
        assertEquals(y, rect.getLowerLeftY(), 0.01);
        assertEquals(width, rect.getWidth(), 0.01);
        assertEquals(height, rect.getHeight(), 0.01);
    }

    @TempDir Path tempDir;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @InjectMocks private SetPageBoxesController controller;

    @BeforeEach
    void setUp() throws IOException {
        lenient()
                .when(pdfDocumentFactory.load(any(PDFFile.class)))
                .thenAnswer(
                        inv ->
                                Loader.loadPDF(
                                        ((PDFFile) inv.getArgument(0)).getFileInput().getBytes()));
        lenient()
                .when(tempFileManager.createManagedTempFile(anyString()))
                .thenAnswer(
                        inv -> {
                            java.io.File f =
                                    Files.createTempFile("test", inv.<String>getArgument(0))
                                            .toFile();
                            TempFile tf = mock(TempFile.class);
                            lenient().when(tf.getFile()).thenReturn(f);
                            lenient().when(tf.getPath()).thenReturn(f.toPath());
                            lenient().when(tf.getAbsolutePath()).thenReturn(f.getAbsolutePath());
                            return tf;
                        });
    }

    private MockMultipartFile createPdf(PDRectangle trimBox) throws IOException {
        Path pdfPath = tempDir.resolve("input.pdf");
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            if (trimBox != null) {
                page.setTrimBox(trimBox);
            }
            doc.addPage(page);
            doc.save(pdfPath.toFile());
        }
        return new MockMultipartFile(
                "fileInput",
                "input.pdf",
                MediaType.APPLICATION_PDF_VALUE,
                Files.readAllBytes(pdfPath));
    }

    private SetPageBoxesRequest request(MockMultipartFile file) {
        SetPageBoxesRequest request = new SetPageBoxesRequest();
        request.setFileInput(file);
        return request;
    }

    @Test
    void testSetExplicitBoxes() throws Exception {
        SetPageBoxesRequest request = request(createPdf(null));
        request.setTrimBox("20,20,400,600");
        request.setBleedBox("10,10,420,620");

        ResponseEntity<Resource> response = controller.setPageBoxes(request);

        assertEquals(200, response.getStatusCode().value());
        try (PDDocument result = Loader.loadPDF(drainBody(response))) {
            PDPage page = result.getPage(0);
            assertRectEquals(20, 20, 400, 600, page.getTrimBox());
            assertRectEquals(10, 10, 420, 620, page.getBleedBox());
            assertRectEquals(
                    0,
                    0,
                    PDRectangle.A4.getWidth(),
                    PDRectangle.A4.getHeight(),
                    page.getMediaBox());
        }
    }

    @Test
    void testBleedMmExpandsAroundTrimBox() throws Exception {
        SetPageBoxesRequest request = request(createPdf(new PDRectangle(20, 20, 400, 600)));
        request.setBleedMm(5);

        ResponseEntity<Resource> response = controller.setPageBoxes(request);

        assertEquals(200, response.getStatusCode().value());
        try (PDDocument result = Loader.loadPDF(drainBody(response))) {
            PDRectangle bleed = result.getPage(0).getBleedBox();
            assertRectEquals(20 - 5 * MM, 20 - 5 * MM, 400 + 10 * MM, 600 + 10 * MM, bleed);
        }
    }

    @Test
    void testTrimMarginMmInsetsMediaBox() throws Exception {
        SetPageBoxesRequest request = request(createPdf(null));
        request.setTrimMarginMm(10);

        ResponseEntity<Resource> response = controller.setPageBoxes(request);

        assertEquals(200, response.getStatusCode().value());
        try (PDDocument result = Loader.loadPDF(drainBody(response))) {
            PDRectangle trim = result.getPage(0).getTrimBox();
            assertRectEquals(
                    10 * MM,
                    10 * MM,
                    PDRectangle.A4.getWidth() - 20 * MM,
                    PDRectangle.A4.getHeight() - 20 * MM,
                    trim);
        }
    }

    @Test
    void testCopyMissingFromMediaBox() throws Exception {
        SetPageBoxesRequest request = request(createPdf(null));
        request.setCopyMissingFromMediaBox(true);

        ResponseEntity<Resource> response = controller.setPageBoxes(request);

        assertEquals(200, response.getStatusCode().value());
        try (PDDocument result = Loader.loadPDF(drainBody(response))) {
            PDPage page = result.getPage(0);
            PDRectangle a4 = PDRectangle.A4;
            // The box getters fall back to CropBox/MediaBox, so the dictionary itself
            // must contain the entries for the copy to have really happened.
            for (COSName name :
                    new COSName[] {
                        COSName.CROP_BOX, COSName.TRIM_BOX, COSName.BLEED_BOX, COSName.ART_BOX
                    }) {
                assertNotNull(
                        page.getCOSObject().getItem(name), name.getName() + " was not written");
            }
            assertRectEquals(0, 0, a4.getWidth(), a4.getHeight(), page.getCropBox());
            assertRectEquals(0, 0, a4.getWidth(), a4.getHeight(), page.getTrimBox());
            assertRectEquals(0, 0, a4.getWidth(), a4.getHeight(), page.getBleedBox());
            assertRectEquals(0, 0, a4.getWidth(), a4.getHeight(), page.getArtBox());
        }
    }

    @Test
    void testNoParametersThrows() {
        SetPageBoxesRequest request = requestUnchecked();
        assertThrows(IllegalArgumentException.class, () -> controller.setPageBoxes(request));
    }

    @Test
    void testInvalidRectThrows() throws Exception {
        SetPageBoxesRequest request = request(createPdf(null));
        request.setTrimBox("1,2,3");
        assertThrows(IllegalArgumentException.class, () -> controller.setPageBoxes(request));
    }

    @Test
    void testNonNumericRectThrows() throws Exception {
        SetPageBoxesRequest request = request(createPdf(null));
        request.setBleedBox("a,b,c,d");
        assertThrows(IllegalArgumentException.class, () -> controller.setPageBoxes(request));
    }

    @Test
    void testNonFiniteRectThrows() throws Exception {
        SetPageBoxesRequest request = request(createPdf(null));
        request.setTrimBox("0,0,NaN,600");
        assertThrows(IllegalArgumentException.class, () -> controller.setPageBoxes(request));
        request.setTrimBox("0,0,Infinity,600");
        assertThrows(IllegalArgumentException.class, () -> controller.setPageBoxes(request));
    }

    private SetPageBoxesRequest requestUnchecked() {
        try {
            return request(createPdf(null));
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }
}
