package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.io.MemoryUsageSetting;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.controller.api.misc.AdjustContrastController.ColorAdjustment;
import stirling.software.SPDF.model.api.misc.AdjustContrastRequest;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class AdjustContrastControllerTest {

    /**
     * Pixels run through the editor's own {@code applyAdjustmentsToCanvas}, one line per settings
     * combination: {@code contrast,brightness,saturation,red,green,blue;in:out in:out ...} as
     * 0xRRGGBB hex. Regenerate from the editor if its pixel maths changes.
     */
    private static final String FRONTEND_VECTORS = "/adjust-contrast/frontend-vectors.txt";

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @InjectMocks private AdjustContrastController controller;

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
    void pixelMathMatchesTheEditor() throws IOException {
        List<String> lines;
        try (InputStream in =
                Objects.requireNonNull(getClass().getResourceAsStream(FRONTEND_VECTORS))) {
            lines =
                    new String(in.readAllBytes(), StandardCharsets.UTF_8)
                            .lines()
                            .filter(line -> !line.isBlank())
                            .toList();
        }
        assertThat(lines).isNotEmpty();

        int checked = 0;
        for (String line : lines) {
            String[] parts = line.split(";");
            String[] settings = parts[0].split(",");
            ColorAdjustment adjustment =
                    new ColorAdjustment(
                            Integer.parseInt(settings[0]) / 100.0,
                            Integer.parseInt(settings[1]) / 100.0,
                            Integer.parseInt(settings[2]) / 100.0,
                            Integer.parseInt(settings[3]) / 100.0,
                            Integer.parseInt(settings[4]) / 100.0,
                            Integer.parseInt(settings[5]) / 100.0);
            for (String pair : parts[1].split(" ")) {
                int input = Integer.parseInt(pair.substring(0, 6), 16);
                int expected = Integer.parseInt(pair.substring(7), 16);
                assertThat(adjustment.apply(input))
                        .as("settings %s, pixel %06x", parts[0], input)
                        .isEqualTo(expected);
                checked++;
            }
        }
        assertThat(checked).isGreaterThan(1000);
    }

    @Test
    void neutralSettingsLeaveGreyscaleUnchanged() {
        ColorAdjustment neutral = new ColorAdjustment(1, 1, 1, 1, 1, 1);
        for (int v = 0; v < 256; v++) {
            int grey = (v << 16) | (v << 8) | v;
            assertThat(neutral.apply(grey)).isEqualTo(grey);
        }
    }

    @Test
    void producesOneImagePagePerSourcePageAtTheSourceSize() throws Exception {
        AdjustContrastRequest request = new AdjustContrastRequest();
        request.setFileInput(createPdf());
        request.setContrast(150);
        request.setBlue(0);

        when(pdfDocumentFactory.load(request))
                .thenReturn(Loader.loadPDF(request.getFileInput().getBytes()));
        when(pdfDocumentFactory.createNewDocument(any(MemoryUsageSetting.class)))
                .thenAnswer(inv -> new PDDocument());

        ResponseEntity<Resource> response = controller.adjustContrast(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        try (PDDocument result = Loader.loadPDF(drainBody(response))) {
            assertThat(result.getNumberOfPages()).isEqualTo(2);

            PDPage letter = result.getPage(0);
            assertThat(letter.getMediaBox().getWidth()).isEqualTo(612f);
            assertThat(letter.getMediaBox().getHeight()).isEqualTo(792f);

            // Rotation is baked into the render, as in the editor.
            PDPage rotatedA5 = result.getPage(1);
            assertThat(rotatedA5.getRotation()).isZero();
            assertThat(rotatedA5.getMediaBox().getWidth())
                    .isEqualTo((float) Math.floor(PDRectangle.A5.getHeight() * 2) / 2);

            List<COSName> xObjects = new ArrayList<>();
            rotatedA5.getResources().getXObjectNames().forEach(xObjects::add);
            assertThat(xObjects).hasSize(1);
            assertThat(rotatedA5.getResources().getXObject(xObjects.get(0)))
                    .isInstanceOf(PDImageXObject.class);
        }
    }

    private static MockMultipartFile createPdf() throws IOException {
        try (PDDocument doc = new PDDocument();
                ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            PDPage letter = new PDPage(PDRectangle.LETTER);
            doc.addPage(letter);
            try (PDPageContentStream cs = new PDPageContentStream(doc, letter)) {
                cs.setNonStrokingColor(0.8f, 0.2f, 0.4f);
                cs.addRect(100, 100, 200, 200);
                cs.fill();
            }
            PDPage rotatedA5 = new PDPage(PDRectangle.A5);
            rotatedA5.setRotation(90);
            doc.addPage(rotatedA5);
            doc.save(out);
            return new MockMultipartFile(
                    "fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, out.toByteArray());
        }
    }

    private static byte[] drainBody(ResponseEntity<Resource> response) throws IOException {
        try (InputStream in = Objects.requireNonNull(response.getBody()).getInputStream()) {
            return in.readAllBytes();
        }
    }
}
