package stirling.software.proprietary.controller.api;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.github.pixee.security.Filenames;
import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.proprietary.classification.ClassificationLabelProvider;
import stirling.software.proprietary.classification.HeuristicClassifier;
import stirling.software.proprietary.classification.HeuristicDocExtractor;
import stirling.software.proprietary.classification.model.ClassificationLabel;
import stirling.software.proprietary.model.api.ai.AiPageText;
import stirling.software.proprietary.service.AiEngineClient;
import stirling.software.proprietary.service.PdfContentExtractor;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Dispatchable tool that classifies a PDF and writes the result into its metadata.
 *
 * <p>Runs as a Classification-policy pipeline step. It always classifies locally first with the
 * non-AI {@link HeuristicClassifier}; when the AI engine is enabled and the heuristic isn't
 * high-confidence, it escalates to the engine (reading a bounded page window) so only ambiguous
 * documents incur the AI call. Either way the label JSON (minus the transport-only {@code outcome}
 * field) is stored in the custom Info-dictionary key {@link PdfMetadataService#CLASSIFICATION_KEY},
 * so billing, audit, and the UI can't tell the two apart. Returns the labelled PDF. Not intended
 * for direct client use.
 */
@Slf4j
@Hidden
@RestController
@RequestMapping("/api/v1/ai/tools")
@Tag(name = "AI Tools", description = "Dispatchable AI-backed tools.")
public class ClassifyLabelController {

    /** Pages read from each end of the document — mirrors the engine's window. */
    private static final int WINDOW_PAGES = 2;

    private static final String CLASSIFY_ENDPOINT = "/api/v1/documents/classify";

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final TempFileManager tempFileManager;
    private final PdfContentExtractor pdfContentExtractor;
    private final PdfMetadataService pdfMetadataService;
    private final AiEngineClient aiEngineClient;
    private final ObjectMapper objectMapper;
    private final UserServiceInterface userService;
    private final ApplicationProperties applicationProperties;
    private final HeuristicClassifier heuristicClassifier;
    private final HeuristicDocExtractor heuristicDocExtractor;

    /**
     * The fixed, built-in vocabulary shared by everyone — see {@link ClassificationLabelProvider}.
     */
    private final ClassificationLabelProvider labelProvider;

    public ClassifyLabelController(
            CustomPDFDocumentFactory pdfDocumentFactory,
            TempFileManager tempFileManager,
            PdfContentExtractor pdfContentExtractor,
            PdfMetadataService pdfMetadataService,
            AiEngineClient aiEngineClient,
            ObjectMapper objectMapper,
            ClassificationLabelProvider labelProvider,
            ApplicationProperties applicationProperties,
            HeuristicClassifier heuristicClassifier,
            HeuristicDocExtractor heuristicDocExtractor,
            @Autowired(required = false) UserServiceInterface userService) {
        this.pdfDocumentFactory = pdfDocumentFactory;
        this.tempFileManager = tempFileManager;
        this.pdfContentExtractor = pdfContentExtractor;
        this.pdfMetadataService = pdfMetadataService;
        this.aiEngineClient = aiEngineClient;
        this.objectMapper = objectMapper;
        this.labelProvider = labelProvider;
        this.applicationProperties = applicationProperties;
        this.heuristicClassifier = heuristicClassifier;
        this.heuristicDocExtractor = heuristicDocExtractor;
        this.userService = userService;
    }

    @PostMapping(value = "/classify-and-label", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Classify a PDF and label its metadata",
            description =
                    "Reads the first two and last two pages, classifies the document via the AI"
                            + " engine, and stores the result in the StirlingPDFClassification"
                            + " metadata field. Dispatched by the Classification policy; not"
                            + " intended for direct client use.")
    public ResponseEntity<Resource> classifyAndLabel(
            @RequestParam("fileInput") MultipartFile fileInput) throws IOException {
        try (PDDocument document = pdfDocumentFactory.load(fileInput, true)) {
            String fileName = safeFileName(fileInput.getOriginalFilename());

            List<EngineLabel> allowed = resolveAllowedLabels();
            if (allowed.isEmpty()) {
                // No vocabulary to classify against: pass the file through unlabelled rather than
                // classify against nothing.
                log.debug("[classify-and-label] {} has no labels; skipping", fileName);
                return WebResponseUtils.pdfDocToWebResponse(document, fileName, tempFileManager);
            }

            // Cascade: always classify locally first (cheap, no AI cost). With the AI engine on,
            // escalate to it only when the heuristic isn't definitive (high confidence + a label),
            // so easy docs skip the paid AI call and only ambiguous ones pay for it. AI off →
            // always
            // heuristic. Both write the same classification metadata, so billing/audit/UI match.
            HeuristicClassifier.HeuristicResult heuristic =
                    heuristicClassifier.classify(heuristicDocExtractor.extract(document, fileName));
            boolean escalateToAi =
                    applicationProperties.getAiEngine().isEnabled() && !heuristic.isDefinitive();
            String metadataValue =
                    escalateToAi
                            ? classifyWithAiEngine(document, fileName, allowed)
                            : toHeuristicMetadata(fileName, heuristic);
            pdfMetadataService.setClassificationMetadata(document, metadataValue);

            return WebResponseUtils.pdfDocToWebResponse(document, fileName, tempFileManager);
        }
    }

    /** AI path: send a bounded page window to the engine and keep its label JSON verbatim. */
    private String classifyWithAiEngine(
            PDDocument document, String fileName, List<EngineLabel> allowed) throws IOException {
        List<AiPageText> pages = extractWindow(document);
        String requestBody =
                objectMapper.writeValueAsString(
                        new ClassifyEngineRequest(fileName, pages, allowed));
        String userId = userService != null ? userService.getCurrentUsername() : null;
        String responseJson = aiEngineClient.post(CLASSIFY_ENDPOINT, requestBody, userId);
        log.debug("[classify-and-label] AI-labelled {} ({} window pages)", fileName, pages.size());
        return toMetadataValue(responseJson);
    }

    /**
     * Serialize a heuristic result to the same {@code {"labels":[...]}} shape the AI path writes.
     */
    private String toHeuristicMetadata(
            String fileName, HeuristicClassifier.HeuristicResult result) {
        ObjectNode node = objectMapper.createObjectNode();
        ArrayNode labels = node.putArray("labels");
        result.labels().forEach(labels::add);
        log.debug(
                "[classify-and-label] heuristic-labelled {} -> {} ({})",
                fileName,
                result.labels(),
                result.confidence());
        return objectMapper.writeValueAsString(node);
    }

    private List<AiPageText> extractWindow(PDDocument document) throws IOException {
        List<AiPageText> pages = new ArrayList<>();
        for (int pageNumber : windowPageNumbers(document.getNumberOfPages(), WINDOW_PAGES)) {
            String text = pdfContentExtractor.extractPageTextRaw(document, pageNumber);
            if (text != null && !text.isBlank()) {
                pages.add(new AiPageText(pageNumber, text));
            }
        }
        return pages;
    }

    /** First and last {@code window} page numbers (1-based), de-duplicated and in order. */
    static List<Integer> windowPageNumbers(int pageCount, int window) {
        Set<Integer> numbers = new LinkedHashSet<>();
        for (int page = 1; page <= Math.min(window, pageCount); page++) {
            numbers.add(page);
        }
        for (int page = Math.max(1, pageCount - window + 1); page <= pageCount; page++) {
            numbers.add(page);
        }
        return new ArrayList<>(numbers);
    }

    /** Drop the transport-only {@code outcome} discriminator; keep the rest verbatim. */
    private String toMetadataValue(String engineResponseJson) {
        JsonNode node = objectMapper.readTree(engineResponseJson);
        if (node instanceof ObjectNode object) {
            object.remove("outcome");
        }
        return objectMapper.writeValueAsString(node);
    }

    private static String safeFileName(String originalFilename) {
        String name = Filenames.toSimpleFileName(originalFilename);
        return (name == null || name.isBlank()) ? "classified.pdf" : name;
    }

    /**
     * The built-in vocabulary as {@code {id, name}} pairs, de-duplicated by id. The engine shows
     * the model the names and returns the ids (icons are presentational and never sent). The engine
     * holds no default vocabulary of its own, so this bundled set is the only source.
     */
    private List<EngineLabel> resolveAllowedLabels() {
        Map<String, EngineLabel> byId = new LinkedHashMap<>();
        collectLabels(labelProvider.labels(), byId);
        return List.copyOf(byId.values());
    }

    private static void collectLabels(
            List<ClassificationLabel> labels, Map<String, EngineLabel> into) {
        for (ClassificationLabel label : labels) {
            if (label.id() == null
                    || label.id().isBlank()
                    || label.name() == null
                    || label.name().isBlank()) {
                continue;
            }
            into.putIfAbsent(label.id(), new EngineLabel(label.id(), label.name()));
        }
    }

    /** One allowed label sent to the engine: stable id + the name the model reasons over. */
    private record EngineLabel(String id, String name) {}

    /** Request body for the engine's {@code /api/v1/documents/classify} endpoint. */
    private record ClassifyEngineRequest(
            String fileName, List<AiPageText> pages, List<EngineLabel> labels) {}
}
