package stirling.software.SPDF.controller.api.misc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.apache.pdfbox.util.Matrix;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.model.api.misc.AutoRotateAnalysisResult;
import stirling.software.SPDF.model.api.misc.AutoRotatePdfRequest;
import stirling.software.SPDF.model.api.misc.PageRotation;
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class AutoRotateControllerTest {

    private static final String SAMPLE_TEXT = "The quick brown fox jumps over the lazy dog again and again";

    @Mock
    private CustomPDFDocumentFactory pdfDocumentFactory;

    @Mock
    private TempFileManager tempFileManager;

    @Mock
    private EndpointConfiguration endpointConfiguration;

    @Mock
    private RuntimePathConfig runtimePathConfig;

    @Mock
    private ApplicationProperties applicationProperties;

    @InjectMocks
    private AutoRotateController controller;

    @BeforeEach
    void setUp() throws Exception {
        lenient().when(tempFileManager.createManagedTempFile(anyString())).thenAnswer(inv -> {
            File f = Files.createTempFile("test", inv.<String>getArgument(0)).toFile();
            TempFile tf = mock(TempFile.class);
            lenient().when(tf.getFile()).thenReturn(f);
            lenient().when(tf.getPath()).thenReturn(f.toPath());
            return tf;
        });
        lenient().when(endpointConfiguration.isGroupEnabled("tesseract")).thenReturn(false);
    }

    private static PDDocument docWithUprightText(int... pageRotations) throws IOException {
        PDDocument document = new PDDocument();
        for (int rotation : pageRotations) {
            PDPage page = new PDPage(PDRectangle.LETTER);
            document.addPage(page);
            try (PDPageContentStream content = new PDPageContentStream(document, page)) {
                content.beginText();
                content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                content.setTextMatrix(Matrix.getTranslateInstance(72, 400));
                content.showText(SAMPLE_TEXT);
                content.endText();
            }
            page.setRotation(rotation);
        }
        return document;
    }

    private AutoRotatePdfRequest request(PDDocument document) throws IOException {
        AutoRotatePdfRequest request = new AutoRotatePdfRequest();
        request.setFileInput(
                new MockMultipartFile("fileInput", "test.pdf", MediaType.APPLICATION_PDF_VALUE, new byte[] {1, 2, 3}));
        when(pdfDocumentFactory.load(request)).thenReturn(document);
        return request;
    }

    private static PDDocument reload(ResponseEntity<?> response) throws IOException {
        Resource resource = (Resource) response.getBody();
        return Loader.loadPDF(resource.getContentAsByteArray());
    }

    private static PDDocument docWithTextAt(int textAngleDegrees, int pageRotation) throws IOException {
        PDDocument document = new PDDocument();
        PDPage page = new PDPage(PDRectangle.LETTER);
        document.addPage(page);
        try (PDPageContentStream content = new PDPageContentStream(document, page)) {
            content.beginText();
            content.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
            content.setTextMatrix(Matrix.getRotateInstance(Math.toRadians(textAngleDegrees), 300, 400));
            content.showText(SAMPLE_TEXT);
            content.endText();
        }
        page.setRotation(pageRotation);
        return document;
    }

    /**
     * Reads the dominant glyph direction straight from a document, independently of the production
     * detection code, so the round-trip assertion below validates the result rather than restating
     * the formula under test.
     */
    private static int dominantGlyphDirection(PDDocument document) throws IOException {
        int[] counts = new int[4];
        PDFTextStripper stripper = new PDFTextStripper() {
            @Override
            protected void processTextPosition(TextPosition text) {
                if (!text.getUnicode().isBlank()) {
                    counts[Math.floorMod(Math.round(text.getDir()), 360) / 90]++;
                }
            }
        };
        stripper.setStartPage(1);
        stripper.setEndPage(1);
        stripper.getText(document);
        int best = 0;
        for (int i = 1; i < 4; i++) {
            if (counts[i] > counts[best]) {
                best = i;
            }
        }
        return best * 90;
    }

    /**
     * End-to-end round trip: build a page whose text is drawn at a known angle under a known
     * /Rotate, run the real controller, then assert the output actually displays upright. Upright
     * means the glyph direction and the page rotation cancel — computed here in the test, not via
     * the production helper.
     */
    @ParameterizedTest
    @CsvSource({
        "0,   0",
        "0,   90",
        "0,   180",
        "0,   270",
        "90,  0",
        "90,  90",
        "180, 0",
        "180, 270",
        "270, 90",
    })
    void roundTripLeavesPageUpright(int textAngle, int pageRotation) throws Exception {
        AutoRotatePdfRequest request = request(docWithTextAt(textAngle, pageRotation));
        request.setDetectionMode("text");

        ResponseEntity<?> response = controller.autoRotatePdf(request);

        try (PDDocument corrected = reload(response)) {
            int glyphDirection = dominantGlyphDirection(corrected);
            int finalRotation = Math.floorMod(corrected.getPage(0).getRotation(), 360);
            assertThat(Math.floorMod(glyphDirection - finalRotation, 360))
                    .as(
                            "text drawn at %d under /Rotate %d should display upright, got glyph"
                                    + " direction %d with /Rotate %d",
                            textAngle, pageRotation, glyphDirection, finalRotation)
                    .isZero();
        }
    }

    @Test
    void dryRunReportsTextDetection() throws Exception {
        AutoRotatePdfRequest request = request(docWithUprightText(90, 0));
        request.setDryRun(true);
        request.setDetectionMode("text");

        ResponseEntity<?> response = controller.autoRotatePdf(request);

        AutoRotateAnalysisResult result = (AutoRotateAnalysisResult) response.getBody();
        assertThat(result.getTotalPages()).isEqualTo(2);
        assertThat(result.getPagesToRotate()).isEqualTo(1);
        assertThat(result.getDetectedByText()).isEqualTo(2);

        AutoRotateAnalysisResult.PageResult first = result.getPages().get(0);
        assertThat(first.getMethod()).isEqualTo("text");
        assertThat(first.getCorrection()).isEqualTo(270);
        assertThat(first.isApply()).isTrue();
        assertThat(first.getConfidence()).isEqualTo(100.0);

        AutoRotateAnalysisResult.PageResult second = result.getPages().get(1);
        assertThat(second.getCorrection()).isZero();
        assertThat(second.isApply()).isFalse();
    }

    @Test
    void appliesDetectedCorrections() throws Exception {
        AutoRotatePdfRequest request = request(docWithUprightText(90, 0));
        request.setDetectionMode("text");

        ResponseEntity<?> response = controller.autoRotatePdf(request);

        try (PDDocument corrected = reload(response)) {
            assertThat(corrected.getPage(0).getRotation()).isZero();
            assertThat(corrected.getPage(1).getRotation()).isZero();
        }
    }

    @Test
    void appliesExplicitPageRotations() throws Exception {
        AutoRotatePdfRequest request = request(docWithUprightText(0, 0));
        request.setPageRotations(List.of(new PageRotation(1, 90)));

        ResponseEntity<?> response = controller.autoRotatePdf(request);

        try (PDDocument corrected = reload(response)) {
            assertThat(corrected.getPage(0).getRotation()).isEqualTo(90);
            assertThat(corrected.getPage(1).getRotation()).isZero();
        }
    }

    @Test
    void reportsTesseractUnavailableForTextlessPages() throws Exception {
        PDDocument document = new PDDocument();
        document.addPage(new PDPage(PDRectangle.LETTER));
        AutoRotatePdfRequest request = request(document);
        request.setDryRun(true);

        ResponseEntity<?> response = controller.autoRotatePdf(request);

        AutoRotateAnalysisResult result = (AutoRotateAnalysisResult) response.getBody();
        AutoRotateAnalysisResult.PageResult page = result.getPages().get(0);
        assertThat(page.getMethod()).isEqualTo("none");
        assertThat(page.getNote()).isEqualTo("tesseractUnavailable");
        assertThat(result.getUndetected()).isEqualTo(1);
    }

    @Test
    void infersUndetectedPageFromDocumentConsensus() throws Exception {
        // Page 1 has body text and is rotated 90 (-> 270 correction); page 2 is blank and shares
        // the same rotation. With OSD unavailable, page 2 can't be detected on its own, so it
        // should inherit page 1's 270 correction.
        PDDocument document = docWithUprightText(90);
        PDPage blank = new PDPage(PDRectangle.LETTER);
        blank.setRotation(90);
        document.addPage(blank);
        AutoRotatePdfRequest request = request(document);
        request.setDryRun(true);
        request.setDetectionMode("text");

        ResponseEntity<?> response = controller.autoRotatePdf(request);

        AutoRotateAnalysisResult result = (AutoRotateAnalysisResult) response.getBody();
        AutoRotateAnalysisResult.PageResult page2 = result.getPages().get(1);
        assertThat(page2.getMethod()).isEqualTo("inferred");
        assertThat(page2.getCorrection()).isEqualTo(270);
        assertThat(page2.isApply()).isTrue();
        assertThat(page2.getNote()).isEqualTo("inferredFromDocument");
        assertThat(result.getInferred()).isEqualTo(1);
        assertThat(result.getPagesToRotate()).isEqualTo(2);
    }

    @Test
    void doesNotInferWhenDisabled() throws Exception {
        PDDocument document = docWithUprightText(90);
        PDPage blank = new PDPage(PDRectangle.LETTER);
        blank.setRotation(90);
        document.addPage(blank);
        AutoRotatePdfRequest request = request(document);
        request.setDryRun(true);
        request.setDetectionMode("text");
        request.setInferUndetected(false);

        ResponseEntity<?> response = controller.autoRotatePdf(request);

        AutoRotateAnalysisResult result = (AutoRotateAnalysisResult) response.getBody();
        AutoRotateAnalysisResult.PageResult page2 = result.getPages().get(1);
        assertThat(page2.getMethod()).isEqualTo("none");
        assertThat(page2.isApply()).isFalse();
        assertThat(result.getInferred()).isZero();
        assertThat(result.getUndetected()).isEqualTo(1);
    }

    @Test
    void rejectsInvalidDetectionMode() {
        AutoRotatePdfRequest request = new AutoRotatePdfRequest();
        request.setDetectionMode("magic");

        assertThatThrownBy(() -> controller.autoRotatePdf(request)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsRotationThatIsNotAMultipleOf90() throws Exception {
        AutoRotatePdfRequest request = request(docWithUprightText(0));
        request.setPageRotations(List.of(new PageRotation(1, 45)));

        assertThatThrownBy(() -> controller.autoRotatePdf(request)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsPageRotationOutsideTheDocument() throws Exception {
        AutoRotatePdfRequest request = request(docWithUprightText(0));
        request.setPageRotations(List.of(new PageRotation(5, 90)));

        assertThatThrownBy(() -> controller.autoRotatePdf(request)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsDuplicatePageInRotations() throws Exception {
        // Rotations are additive, so applying the same page twice would over-rotate it.
        AutoRotatePdfRequest request = request(docWithUprightText(0, 0));
        request.setPageRotations(List.of(new PageRotation(1, 90), new PageRotation(1, 90)));

        assertThatThrownBy(() -> controller.autoRotatePdf(request)).isInstanceOf(IllegalArgumentException.class);
    }
}
