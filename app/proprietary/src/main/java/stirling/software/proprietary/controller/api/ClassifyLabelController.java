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

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfMetadataService;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.common.util.TempFileManager;
import stirling.software.common.util.WebResponseUtils;
import stirling.software.proprietary.classification.ClassificationLabelProvider;
import stirling.software.proprietary.classification.model.ClassificationLabel;
import stirling.software.proprietary.model.api.ai.AiPageText;
import stirling.software.proprietary.service.AiEngineClient;
import stirling.software.proprietary.service.AiFeatureGate;
import stirling.software.proprietary.service.PdfContentExtractor;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Dispatchable tool that classifies a PDF and writes the result into its metadata.
 *
 * <p>Runs as a Classification-policy pipeline step: it reads a bounded page window, asks the AI
 * engine to classify the document against the built-in label set, and stores the engine's JSON
 * answer — minus the transport-only {@code outcome} field — in the custom Info-dictionary key
 * {@link PdfMetadataService#CLASSIFICATION_KEY}. Returns the labelled PDF. Not intended for direct
 * client use.
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
    private final AiFeatureGate aiFeatureGate;
    private final ObjectMapper objectMapper;
    private final UserServiceInterface userService;

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
            AiFeatureGate aiFeatureGate,
            ObjectMapper objectMapper,
            ClassificationLabelProvider labelProvider,
            @Autowired(required = false) UserServiceInterface userService) {
        this.pdfDocumentFactory = pdfDocumentFactory;
        this.tempFileManager = tempFileManager;
        this.pdfContentExtractor = pdfContentExtractor;
        this.pdfMetadataService = pdfMetadataService;
        this.aiEngineClient = aiEngineClient;
        this.aiFeatureGate = aiFeatureGate;
        this.objectMapper = objectMapper;
        this.labelProvider = labelProvider;
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
        aiFeatureGate.requireClassify();
        try (PDDocument document = pdfDocumentFactory.load(fileInput, true)) {
            String fileName = safeFileName(fileInput.getOriginalFilename());

            List<EngineLabel> allowed = resolveAllowedLabels();
            if (allowed.isEmpty()) {
                // No vocabulary to classify against: pass the file through unlabelled rather than
                // ask the engine to classify against nothing.
                log.debug("[classify-and-label] {} has no labels; skipping", fileName);
                return WebResponseUtils.pdfDocToWebResponse(document, fileName, tempFileManager);
            }

            List<AiPageText> pages = extractWindow(document);
            String requestBody =
                    objectMapper.writeValueAsString(
                            new ClassifyEngineRequest(fileName, pages, allowed));

            String userId = userService != null ? userService.getCurrentUsername() : null;
            String responseJson = aiEngineClient.post(CLASSIFY_ENDPOINT, requestBody, userId);

            pdfMetadataService.setClassificationMetadata(document, toMetadataValue(responseJson));
            log.debug("[classify-and-label] labelled {} ({} window pages)", fileName, pages.size());

            return WebResponseUtils.pdfDocToWebResponse(document, fileName, tempFileManager);
        }
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
