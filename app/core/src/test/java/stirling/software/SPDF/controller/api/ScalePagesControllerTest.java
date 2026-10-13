package stirling.software.SPDF.controller.api;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import java.awt.Color;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.PDResources;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory;
import org.apache.pdfbox.pdmodel.graphics.optionalcontent.PDOptionalContentGroup;
import org.apache.pdfbox.pdmodel.graphics.optionalcontent.PDOptionalContentProperties;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationRubberStamp;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceDictionary;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAppearanceStream;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.SPDF.model.api.general.ScalePagesRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class ScalePagesControllerTest {
    private static ResponseEntity<Resource> streamingOk(byte[] bytes) {
        return ResponseEntity.ok(new ByteArrayResource(bytes));
    }

    private static byte[] drainBody(ResponseEntity<Resource> response) throws java.io.IOException {
        java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
        try (java.io.InputStream __in = response.getBody().getInputStream()) {
            __in.transferTo(baos);
        }
        return baos.toByteArray();
    }

    @TempDir Path tempDir;
    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @InjectMocks private ScalePagesController controller;

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

    private byte[] createRealPdf(PDRectangle pageSize, int numPages) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            for (int i = 0; i < numPages; i++) {
                doc.addPage(new PDPage(pageSize));
            }
            Path pdfPath = tempDir.resolve("input.pdf");
            doc.save(pdfPath.toFile());
            return Files.readAllBytes(pdfPath);
        }
    }

    private void setupFactory() throws IOException {
        when(pdfDocumentFactory.load(any(MultipartFile.class)))
                .thenAnswer(
                        inv -> {
                            byte[] bytes = ((MultipartFile) inv.getArgument(0)).getBytes();
                            return org.apache.pdfbox.Loader.loadPDF(bytes);
                        });
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(any(PDDocument.class)))
                .thenAnswer(inv -> new PDDocument());
    }

    @Test
    void testScalePages_A4ToA3() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(file);
        request.setPageSize("A3");
        request.setScaleFactor(1.0f);

        setupFactory();

        ResponseEntity<Resource> response = controller.scalePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertTrue(drainBody(response).length > 0);
    }

    @Test
    void testScalePages_KeepSize() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 2);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(file);
        request.setPageSize("KEEP");
        request.setScaleFactor(1.0f);

        setupFactory();

        ResponseEntity<Resource> response = controller.scalePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    void testScalePages_WithScaleFactor() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(file);
        request.setPageSize("A4");
        request.setScaleFactor(0.5f);

        setupFactory();

        ResponseEntity<Resource> response = controller.scalePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    void testScalePages_Letter() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(file);
        request.setPageSize("LETTER");
        request.setScaleFactor(1.0f);

        setupFactory();

        ResponseEntity<Resource> response = controller.scalePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    void testScalePages_Legal() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(file);
        request.setPageSize("LEGAL");
        request.setScaleFactor(1.0f);

        setupFactory();

        ResponseEntity<Resource> response = controller.scalePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    void testScalePages_InvalidPageSize() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(file);
        request.setPageSize("INVALID_SIZE");
        request.setScaleFactor(1.0f);

        setupFactory();

        assertThrows(IllegalArgumentException.class, () -> controller.scalePages(request));
    }

    @Test
    void testScalePages_MultiplePages() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 5);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(file);
        request.setPageSize("A5");
        request.setScaleFactor(1.0f);

        setupFactory();

        ResponseEntity<Resource> response = controller.scalePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    void testScalePages_LandscapeSize() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(file);
        request.setPageSize("A4");
        request.setOrientation("LANDSCAPE");
        request.setScaleFactor(1.0f);

        setupFactory();

        ResponseEntity<Resource> response = controller.scalePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }

    @Test
    void testScalePages_KeepWithEmptyDoc() throws Exception {
        // Create a PDF then load it, but mock factory to return empty doc for KEEP check
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(file);
        request.setPageSize("KEEP");
        request.setScaleFactor(1.0f);

        // Return an empty document to trigger the KEEP exception
        when(pdfDocumentFactory.load(any(MultipartFile.class))).thenReturn(new PDDocument());
        when(pdfDocumentFactory.createNewDocumentBasedOnOldDocument(any(PDDocument.class)))
                .thenAnswer(inv -> new PDDocument());

        assertThrows(IllegalArgumentException.class, () -> controller.scalePages(request));
    }

    @Test
    void testScalePages_A0Size() throws Exception {
        byte[] pdfBytes = createRealPdf(PDRectangle.A4, 1);
        MockMultipartFile file =
                new MockMultipartFile(
                        "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, pdfBytes);

        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(file);
        request.setPageSize("A0");
        request.setScaleFactor(1.0f);

        setupFactory();

        ResponseEntity<Resource> response = controller.scalePages(request);

        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
    }

    @ParameterizedTest
    @CsvSource({
        "0, false, KEEP, PORTRAIT, 1",
        "0, false, A4, PORTRAIT, 0.5",
        "0, true, A4, LANDSCAPE, 1.2",
        "90, true, A4, PORTRAIT, 1",
        "180, true, KEEP, PORTRAIT, 0.75",
        "270, true, A5, LANDSCAPE, 1"
    })
    void preservesSignatureAppearances(
            int rotation, boolean cropped, String size, String orientation, float scale)
            throws Exception {
        setupFactory();
        byte[] stamped = createSignaturePdf(true, rotation, cropped);
        byte[] embedded = createSignaturePdf(false, rotation, cropped);
        try (PDDocument actual =
                        org.apache.pdfbox.Loader.loadPDF(
                                scalePdf(stamped, size, orientation, scale));
                PDDocument expected =
                        org.apache.pdfbox.Loader.loadPDF(
                                scalePdf(embedded, size, orientation, scale))) {
            assertEquals(2, actual.getNumberOfPages());
            assertTrue(
                    new PDFTextStripper()
                            .getText(actual)
                            .replaceAll("\\s+", "")
                            .contains("Searchabletext"));
            PDFRenderer actualRenderer = new PDFRenderer(actual);
            PDFRenderer expectedRenderer = new PDFRenderer(expected);
            for (int page = 0; page < actual.getNumberOfPages(); page++) {
                BufferedImage actualImage = actualRenderer.renderImage(page);
                BufferedImage expectedImage = expectedRenderer.renderImage(page);
                assertEquals(expectedImage.getWidth(), actualImage.getWidth());
                assertEquals(expectedImage.getHeight(), actualImage.getHeight());
                int width = actualImage.getWidth();
                int height = actualImage.getHeight();
                for (int y = 0; y < height; y++) {
                    for (int x = 0; x < width; x++) {
                        if (actualImage.getRGB(x, y) == expectedImage.getRGB(x, y)) continue;
                        // Appearance clipping can round an image edge to the neighboring pixel.
                        assertTrue(
                                matchesNeighbor(actualImage, expectedImage.getRGB(x, y), x, y)
                                        && matchesNeighbor(
                                                expectedImage, actualImage.getRGB(x, y), x, y),
                                "Signature appearance differs on page "
                                        + page
                                        + " at "
                                        + x
                                        + ","
                                        + y);
                    }
                }
            }
        }
    }

    private boolean matchesNeighbor(BufferedImage image, int rgb, int x, int y) {
        for (int adjacentY = Math.max(0, y - 1);
                adjacentY <= Math.min(image.getHeight() - 1, y + 1);
                adjacentY++) {
            for (int adjacentX = Math.max(0, x - 1);
                    adjacentX <= Math.min(image.getWidth() - 1, x + 1);
                    adjacentX++) {
                if (image.getRGB(adjacentX, adjacentY) == rgb) return true;
            }
        }
        return false;
    }

    @ParameterizedTest
    @ValueSource(strings = {"hidden", "noView", "missingAppearance", "emptyBounds"})
    void skipsNonVisibleStampAppearances(String kind) throws Exception {
        setupFactory();
        try (PDDocument source =
                org.apache.pdfbox.Loader.loadPDF(createSignaturePdf(true, 0, false))) {
            for (PDPage page : source.getPages()) {
                var stamp = page.getAnnotations().getFirst();
                switch (kind) {
                    case "hidden" -> stamp.setHidden(true);
                    case "noView" -> stamp.setNoView(true);
                    case "missingAppearance" -> stamp.setAppearance(null);
                    case "emptyBounds" ->
                            stamp.getNormalAppearanceStream().setBBox(new PDRectangle());
                    default -> fail("Unknown stamp case");
                }
            }
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            source.save(bytes);
            try (PDDocument output =
                    org.apache.pdfbox.Loader.loadPDF(
                            scalePdf(bytes.toByteArray(), "KEEP", "PORTRAIT", 1))) {
                BufferedImage rendered = new PDFRenderer(output).renderImage(0);
                assertEquals(Color.WHITE.getRGB(), rendered.getRGB(75, 275));
                assertTrue(new PDFTextStripper().getText(output).contains("Searchable text"));
            }
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void preservesSignatureLayerVisibility(boolean enabled) throws Exception {
        setupFactory();
        try (PDDocument source =
                org.apache.pdfbox.Loader.loadPDF(createSignaturePdf(true, 0, false))) {
            PDOptionalContentGroup layer = new PDOptionalContentGroup("Signatures");
            PDOptionalContentProperties layers = new PDOptionalContentProperties();
            layers.addGroup(layer);
            layers.setGroupEnabled(layer, enabled);
            source.getDocumentCatalog().setOCProperties(layers);
            for (PDPage page : source.getPages()) {
                page.getAnnotations().getFirst().setOptionalContent(layer);
            }
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            source.save(bytes);
            try (PDDocument output =
                    org.apache.pdfbox.Loader.loadPDF(
                            scalePdf(bytes.toByteArray(), "KEEP", "PORTRAIT", 1))) {
                PDOptionalContentProperties outputLayers =
                        output.getDocumentCatalog().getOCProperties();
                assertNotNull(outputLayers);
                assertEquals(enabled, outputLayers.isGroupEnabled("Signatures"));
                for (boolean visible : new boolean[] {enabled, !enabled}) {
                    if (visible != enabled) {
                        outputLayers.setGroupEnabled("Signatures", visible);
                    }
                    PDFRenderer renderer = new PDFRenderer(output);
                    for (int page = 0; page < output.getNumberOfPages(); page++) {
                        BufferedImage rendered = renderer.renderImage(page);
                        assertEquals(
                                (visible ? Color.RED : Color.WHITE).getRGB(),
                                rendered.getRGB(75, 260));
                    }
                }
            }
        }
    }

    private byte[] scalePdf(byte[] bytes, String size, String orientation, float scale)
            throws Exception {
        ScalePagesRequest request = new ScalePagesRequest();
        request.setFileInput(
                new MockMultipartFile(
                        "fileInput", "signed.pdf", MediaType.APPLICATION_PDF_VALUE, bytes));
        request.setPageSize(size);
        request.setOrientation(orientation);
        request.setScaleFactor(scale);
        return drainBody(controller.scalePages(request));
    }

    private byte[] createSignaturePdf(boolean annotation, int rotation, boolean cropped)
            throws IOException {
        try (PDDocument document = new PDDocument()) {
            BufferedImage signature = new BufferedImage(2, 2, BufferedImage.TYPE_INT_ARGB);
            signature.setRGB(0, 0, Color.RED.getRGB());
            signature.setRGB(1, 0, Color.BLUE.getRGB());
            signature.setRGB(0, 1, Color.BLUE.getRGB());
            var image = LosslessFactory.createFromImage(document, signature);
            for (int index = 0; index < 2; index++) {
                PDPage page = new PDPage(new PDRectangle(300, 400));
                page.setRotation(rotation);
                if (cropped) page.setCropBox(new PDRectangle(20, 30, 260, 340));
                document.addPage(page);
                PDRectangle rect = new PDRectangle(50 + index * 20, 100, 100, 50);
                try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                    content.beginText();
                    content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                    content.newLineAtOffset(40, 300);
                    content.showText("Searchable text");
                    content.endText();
                    if (!annotation) {
                        content.drawImage(
                                image,
                                rect.getLowerLeftX(),
                                rect.getLowerLeftY(),
                                rect.getWidth(),
                                rect.getHeight());
                    }
                }
                if (annotation) {
                    PDAppearanceStream appearance = new PDAppearanceStream(document);
                    appearance.setResources(new PDResources());
                    appearance.setBBox(new PDRectangle(10, 20, 40, 20));
                    appearance.setMatrix(new AffineTransform(2, 0, 0, 3, 17, -11));
                    try (PDPageContentStream content =
                            new PDPageContentStream(document, appearance)) {
                        content.drawImage(image, 10, 20, 40, 20);
                    }
                    PDAppearanceDictionary appearances = new PDAppearanceDictionary();
                    appearances.setNormalAppearance(appearance);
                    PDAnnotationRubberStamp stamp = new PDAnnotationRubberStamp();
                    stamp.setRectangle(rect);
                    stamp.setPrinted(true);
                    stamp.setReadOnly(true);
                    stamp.setLocked(true);
                    stamp.setAppearance(appearances);
                    page.getAnnotations().add(stamp);
                }
            }
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            document.save(output);
            return output.toByteArray();
        }
    }
}
