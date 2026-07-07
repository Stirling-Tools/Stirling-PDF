package stirling.software.proprietary.controller.api;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
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

import com.fasterxml.jackson.annotation.JsonInclude;

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
import stirling.software.proprietary.classification.model.ClassificationLabel;
import stirling.software.proprietary.classification.store.ClassificationLabelStore;
import stirling.software.proprietary.model.api.ai.AiPageText;
import stirling.software.proprietary.policy.config.PolicyManagementAuthority;
import stirling.software.proprietary.service.AiEngineClient;
import stirling.software.proprietary.service.PdfContentExtractor;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Dispatchable tool that classifies a PDF and writes the result into its metadata.
 *
 * <p>Runs as a Classification-policy pipeline step: it reads a bounded page window, asks the AI
 * engine to classify the document against the caller's team label set, and stores the engine's JSON
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
    private final ObjectMapper objectMapper;
    private final UserServiceInterface userService;

    /**
     * Present only when the policy subsystem is enabled ({@code policies.enabled}); the store and
     * team authority are gated on it. Null otherwise, in which case classification falls back to
     * the engine's built-in default label vocabulary.
     */
    private final ClassificationLabelStore labelStore;

    private final PolicyManagementAuthority policyManagementAuthority;

    public ClassifyLabelController(
            CustomPDFDocumentFactory pdfDocumentFactory,
            TempFileManager tempFileManager,
            PdfContentExtractor pdfContentExtractor,
            PdfMetadataService pdfMetadataService,
            AiEngineClient aiEngineClient,
            ObjectMapper objectMapper,
            @Autowired(required = false) UserServiceInterface userService,
            @Autowired(required = false) ClassificationLabelStore labelStore,
            @Autowired(required = false) PolicyManagementAuthority policyManagementAuthority) {
        this.pdfDocumentFactory = pdfDocumentFactory;
        this.tempFileManager = tempFileManager;
        this.pdfContentExtractor = pdfContentExtractor;
        this.pdfMetadataService = pdfMetadataService;
        this.aiEngineClient = aiEngineClient;
        this.objectMapper = objectMapper;
        this.userService = userService;
        this.labelStore = labelStore;
        this.policyManagementAuthority = policyManagementAuthority;
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

            List<AiPageText> pages = extractWindow(document);
            String requestBody =
                    objectMapper.writeValueAsString(
                            new ClassifyEngineRequest(fileName, pages, resolveAllowedLabelNames()));

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
     * The allowed label names for the caller's team, de-duplicated case-insensitively. Only the
     * names go to the engine — icons are presentational. Returns {@code null} — falling back to the
     * engine's built-in default vocabulary — when the policy subsystem is disabled (no store) or
     * the team has no stored labels.
     */
    private List<String> resolveAllowedLabelNames() {
        if (labelStore == null) {
            return null;
        }
        Long teamId =
                policyManagementAuthority == null
                        ? null
                        : policyManagementAuthority.currentUserTeamId();

        Map<String, String> namesByLowerCase = new LinkedHashMap<>();
        labelStore
                .findByTeam(teamId)
                .ifPresent(labels -> collectNames(labels.labels(), namesByLowerCase));

        return namesByLowerCase.isEmpty() ? null : List.copyOf(namesByLowerCase.values());
    }

    private static void collectNames(List<ClassificationLabel> labels, Map<String, String> into) {
        for (ClassificationLabel label : labels) {
            if (label.name() == null || label.name().isBlank()) {
                continue;
            }
            into.putIfAbsent(label.name().toLowerCase(Locale.ROOT), label.name());
        }
    }

    /** Request body for the engine's {@code /api/v1/documents/classify} endpoint. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private record ClassifyEngineRequest(
            String fileName, List<AiPageText> pages, List<String> labels) {}
}
