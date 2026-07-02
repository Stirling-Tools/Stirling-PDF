package stirling.software.proprietary.controller.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.web.multipart.MultipartFile;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.util.TempFileManager;
import stirling.software.proprietary.service.AiEngineClient;
import stirling.software.proprietary.service.PdfContentExtractor;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ClassifyTagControllerTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @Mock private PdfContentExtractor pdfContentExtractor;
    @Mock private PdfMetadataService pdfMetadataService;
    @Mock private AiEngineClient aiEngineClient;

    private final ObjectMapper objectMapper = JsonMapper.builder().build();
    private ClassifyTagController controller;

    @BeforeEach
    void setUp() {
        controller =
                new ClassifyTagController(
                        pdfDocumentFactory,
                        tempFileManager,
                        pdfContentExtractor,
                        pdfMetadataService,
                        aiEngineClient,
                        objectMapper,
                        null,
                        null,
                        null);
    }

    @Test
    void classifyAndTag_writesClassificationWithoutOutcome() throws Exception {
        PDDocument document = mock(PDDocument.class);
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("invoice.pdf");
        when(pdfDocumentFactory.load(any(MultipartFile.class), eq(true))).thenReturn(document);
        when(document.getNumberOfPages()).thenReturn(1);
        when(pdfContentExtractor.extractPageTextRaw(document, 1))
                .thenReturn("Invoice total due 100.00");
        when(aiEngineClient.post(eq("/api/v1/documents/classify"), anyString(), isNull()))
                .thenReturn(
                        "{\"outcome\":\"classification\",\"category\":\"invoice\","
                                + "\"docType\":\"invoice\",\"typeConfidence\":0.98,"
                                + "\"tags\":[\"finance\"]}");

        try {
            controller.classifyAndTag(file);
        } catch (Exception ignored) {
            // WebResponseUtils.pdfDocToWebResponse needs a real temp file; the metadata write we
            // assert on has already happened by the time it runs.
        }

        ArgumentCaptor<String> value = ArgumentCaptor.forClass(String.class);
        verify(pdfMetadataService).setClassificationMetadata(eq(document), value.capture());

        JsonNode written = objectMapper.readTree(value.getValue());
        assertThat(written.has("outcome")).isFalse();
        assertThat(written.get("category").asText()).isEqualTo("invoice");
        assertThat(written.get("docType").asText()).isEqualTo("invoice");
        assertThat(written.get("tags").get(0).asText()).isEqualTo("finance");
    }

    @Test
    void windowPageNumbers_takesFirstAndLastWithoutOverlap() {
        assertEquals(List.of(1, 2, 4, 5), ClassifyTagController.windowPageNumbers(5, 2));
        assertEquals(List.of(1, 2, 3), ClassifyTagController.windowPageNumbers(3, 2));
        // Short docs clamp + dedupe rather than throwing or going out of range.
        assertEquals(List.of(1, 2), ClassifyTagController.windowPageNumbers(2, 2));
        assertEquals(List.of(1), ClassifyTagController.windowPageNumbers(1, 2));
        assertEquals(List.of(), ClassifyTagController.windowPageNumbers(0, 2));
    }
}
