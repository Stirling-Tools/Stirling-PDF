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
import stirling.software.proprietary.classification.model.ClassificationLabel;
import stirling.software.proprietary.classification.model.ClassificationLabels;
import stirling.software.proprietary.classification.store.InProcessClassificationLabelStore;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.service.AiEngineClient;
import stirling.software.proprietary.service.PdfContentExtractor;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ClassifyLabelControllerTest {

    private static final Long TEAM = 7L;

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private TempFileManager tempFileManager;
    @Mock private PdfContentExtractor pdfContentExtractor;
    @Mock private PdfMetadataService pdfMetadataService;
    @Mock private AiEngineClient aiEngineClient;
    @Mock private PolicyManagementAuthority policyManagementAuthority;

    private final ObjectMapper objectMapper = JsonMapper.builder().build();
    private InProcessClassificationLabelStore labelStore;
    private ClassifyLabelController controller;

    @BeforeEach
    void setUp() {
        labelStore = new InProcessClassificationLabelStore();
        controller =
                new ClassifyLabelController(
                        pdfDocumentFactory,
                        tempFileManager,
                        pdfContentExtractor,
                        pdfMetadataService,
                        aiEngineClient,
                        objectMapper,
                        null,
                        labelStore,
                        policyManagementAuthority);
    }

    private void stubSinglePageDocument() throws Exception {
        PDDocument document = mock(PDDocument.class);
        MultipartFile file = mock(MultipartFile.class);
        when(file.getOriginalFilename()).thenReturn("invoice.pdf");
        when(pdfDocumentFactory.load(any(MultipartFile.class), eq(true))).thenReturn(document);
        when(document.getNumberOfPages()).thenReturn(1);
        when(pdfContentExtractor.extractPageTextRaw(document, 1))
                .thenReturn("Invoice total due 100.00");
        when(aiEngineClient.post(eq("/api/v1/documents/classify"), anyString(), isNull()))
                .thenReturn("{\"outcome\":\"classification\",\"labels\":[\"invoice\"]}");

        try {
            controller.classifyAndLabel(file);
        } catch (Exception ignored) {
            // WebResponseUtils.pdfDocToWebResponse needs a real temp file; the engine call and
            // metadata write we assert on have already happened by the time it runs.
        }
    }

    private JsonNode sentEngineRequest() throws Exception {
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(aiEngineClient).post(eq("/api/v1/documents/classify"), body.capture(), isNull());
        return objectMapper.readTree(body.getValue());
    }

    @Test
    void classifyAndLabel_writesClassificationWithoutOutcome() throws Exception {
        stubSinglePageDocument();

        ArgumentCaptor<String> value = ArgumentCaptor.forClass(String.class);
        verify(pdfMetadataService)
                .setClassificationMetadata(any(PDDocument.class), value.capture());

        JsonNode written = objectMapper.readTree(value.getValue());
        assertThat(written.has("outcome")).isFalse();
        // The engine returns label ids; they're stored on the document verbatim.
        assertThat(written.get("labels").get(0).asText()).isEqualTo("invoice");
    }

    @Test
    void classifyAndLabel_sendsTeamLabelIdsAndNames() throws Exception {
        when(policyManagementAuthority.currentUserTeamId()).thenReturn(TEAM);
        labelStore.save(
                TEAM,
                new ClassificationLabels(
                        List.of(
                                new ClassificationLabel("invoice", "Invoice", "receipt-long"),
                                new ClassificationLabel("contract", "Contract", null),
                                new ClassificationLabel("timesheet", "Timesheet", null))),
                "admin");

        stubSinglePageDocument();

        JsonNode request = sentEngineRequest();
        assertThat(request.get("fileName").asText()).isEqualTo("invoice.pdf");
        JsonNode labels = request.get("labels");
        assertThat(labels.isArray()).isTrue();
        assertThat(labels.size()).isEqualTo(3);
        // Each entry is an {id, name} pair — the model reasons over names, we store ids.
        assertThat(
                        List.of(
                                labels.get(0).get("id").asText(),
                                labels.get(1).get("id").asText(),
                                labels.get(2).get("id").asText()))
                .containsExactly("invoice", "contract", "timesheet");
        assertThat(
                        List.of(
                                labels.get(0).get("name").asText(),
                                labels.get(1).get("name").asText(),
                                labels.get(2).get("name").asText()))
                .containsExactly("Invoice", "Contract", "Timesheet");
    }

    @Test
    void classifyAndLabel_omitsLabelsWhenNothingStored() throws Exception {
        when(policyManagementAuthority.currentUserTeamId()).thenReturn(TEAM);

        stubSinglePageDocument();

        // No team labels stored: null is serialized away (NON_NULL) so the engine falls back to its
        // built-in default vocabulary.
        assertThat(sentEngineRequest().has("labels")).isFalse();
    }

    @Test
    void windowPageNumbers_takesFirstAndLastWithoutOverlap() {
        assertEquals(List.of(1, 2, 4, 5), ClassifyLabelController.windowPageNumbers(5, 2));
        assertEquals(List.of(1, 2, 3), ClassifyLabelController.windowPageNumbers(3, 2));
        // Short docs clamp + dedupe rather than throwing or going out of range.
        assertEquals(List.of(1, 2), ClassifyLabelController.windowPageNumbers(2, 2));
        assertEquals(List.of(1), ClassifyLabelController.windowPageNumbers(1, 2));
        assertEquals(List.of(), ClassifyLabelController.windowPageNumbers(0, 2));
    }
}
