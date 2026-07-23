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

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.util.Matrix;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
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
import stirling.software.common.configuration.RuntimePathConfig;
import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;

@ExtendWith(MockitoExtension.class)
class AutoRotateControllerTest {

    private static final String SAMPLE_TEXT =
            "The quick brown fox jumps over the lazy dog again and again";

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @Mock private EndpointConfiguration endpointConfiguration;
    @Mock private RuntimePathConfig runtimePathConfig;
    @Mock private ApplicationProperties applicationProperties;

    @InjectMocks private AutoRotateController controller;

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
                new MockMultipartFile(
                        "fileInput",
                        "test.pdf",
                        MediaType.APPLICATION_PDF_VALUE,
                        new byte[] {1, 2, 3}));
        when(pdfDocumentFactory.load(request)).thenReturn(document);
        return request;
    }

    private static PDDocument reload(ResponseEntity<?> response) throws IOException {
        Resource resource = (Resource) response.getBody();
        return Loader.loadPDF(resource.getContentAsByteArray());
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
        request.setPageRotations("{\"1\":90}");

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
    void rejectsInvalidDetectionMode() {
        AutoRotatePdfRequest request = new AutoRotatePdfRequest();
        request.setDetectionMode("magic");

        assertThatThrownBy(() -> controller.autoRotatePdf(request))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsMalformedPageRotations() throws Exception {
        AutoRotatePdfRequest request = request(docWithUprightText(0));
        request.setPageRotations("{\"1\":45}");

        assertThatThrownBy(() -> controller.autoRotatePdf(request))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
