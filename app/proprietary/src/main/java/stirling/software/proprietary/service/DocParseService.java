package stirling.software.proprietary.service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import io.github.pixee.security.Filenames;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.proprietary.model.api.ai.AiPageText;
import stirling.software.proprietary.model.docparse.DocparseCapabilities;
import stirling.software.proprietary.model.docparse.DocparseCapabilitiesView;
import stirling.software.proprietary.model.docparse.DocparseMode;
import stirling.software.proprietary.model.docparse.RagIngestRequest;
import stirling.software.proprietary.model.docparse.RagIngestResponse;

import tools.jackson.databind.ObjectMapper;

/**
 * DocParse ingestion: per-page text extraction (reusing the same {@link PdfContentExtractor} the AI
 * chat path uses) plus engine dispatch for chunk + embed + index. The engine owns chunking,
 * embedding, and the document store; Java owns identity, limits, and the wire contract from {@code
 * engine/src/stirling/contracts/docparse.py}.
 */
@Slf4j
@Service
public class DocParseService {

    private static final String RAG_INGEST_ENDPOINT = "/api/v1/docparse/rag-ingest";

    private final AiEngineClient aiEngineClient;
    private final DocparseCapabilityService capabilityService;
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final PdfContentExtractor pdfContentExtractor;
    private final ApplicationProperties applicationProperties;
    private final ObjectMapper objectMapper;
    private final FileIdStrategy fileIdStrategy;
    private final UserServiceInterface userService;

    public DocParseService(
            AiEngineClient aiEngineClient,
            DocparseCapabilityService capabilityService,
            CustomPDFDocumentFactory pdfDocumentFactory,
            PdfContentExtractor pdfContentExtractor,
            ApplicationProperties applicationProperties,
            ObjectMapper objectMapper,
            FileIdStrategy fileIdStrategy,
            @Autowired(required = false) UserServiceInterface userService) {
        this.aiEngineClient = aiEngineClient;
        this.capabilityService = capabilityService;
        this.pdfDocumentFactory = pdfDocumentFactory;
        this.pdfContentExtractor = pdfContentExtractor;
        this.applicationProperties = applicationProperties;
        this.objectMapper = objectMapper;
        this.fileIdStrategy = fileIdStrategy;
        this.userService = userService;
    }

    /** Throws 503 when the docparse.enabled master switch is off. */
    public void requireEnabled() {
        if (!applicationProperties.getDocparse().isEnabled()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "DocParse is disabled");
        }
    }

    public DocparseCapabilitiesView capabilitiesView() {
        ApplicationProperties.Docparse config = applicationProperties.getDocparse();
        DocparseCapabilities capabilities = capabilityService.capabilities();
        return new DocparseCapabilitiesView(
                config.isEnabled(),
                config.getMode(),
                capabilities.advancedInstalled(),
                capabilityService.isEngineReachable(),
                capabilities.doclingVersion());
    }

    /**
     * Chunk, embed, and index the document into the engine's RAG store, and/or echo the parsed
     * content back for corpus export. Text extraction happens here (the engine's basic tier is
     * text-only); the settings mode caps the requested mode, and {@code advanced} without the addon
     * surfaces the engine's 501 addonRequired.
     */
    public RagIngestResponse ragIngest(
            MultipartFile file,
            String documentId,
            int chunkSize,
            int overlap,
            DocparseMode mode,
            boolean index,
            boolean includeMarkdown,
            boolean includeChunks)
            throws IOException {
        requireEnabled();
        if (!index && !includeMarkdown && !includeChunks) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Nothing to do: enable index, exportMarkdown, or exportChunksJsonl");
        }
        // Content hash default: re-ingesting identical bytes dedupes to the same document.
        String docId =
                (documentId == null || documentId.isBlank())
                        ? fileIdStrategy.idFor(file)
                        : documentId.trim();
        List<AiPageText> pages;
        try (PDDocument document = pdfDocumentFactory.load(file, true)) {
            pages = extractPages(document);
        }
        String callerId = currentUserId();
        // Null expiresAt = persistent until explicit delete; ingest here is a deliberate
        // knowledge-base action, unlike the TTL'd auto-ingest in AiWorkflowService.
        RagIngestRequest request =
                new RagIngestRequest(
                        fileName(file),
                        docId,
                        fileName(file),
                        callerId,
                        // Engine forbids an empty list here (min_length=1); null means
                        // "default to the owner" on the engine side.
                        callerId == null ? null : List.of(callerId),
                        null,
                        pages,
                        Math.clamp(chunkSize, 64, 32_768),
                        Math.clamp(overlap, 0, 4_096),
                        effectiveMode(settingsMode(), mode),
                        index,
                        includeMarkdown,
                        includeChunks);
        String responseJson =
                aiEngineClient.postLongRunning(
                        RAG_INGEST_ENDPOINT, objectMapper.writeValueAsString(request), callerId);
        return objectMapper.readValue(responseJson, RagIngestResponse.class);
    }

    /**
     * The settings mode wins when stricter: a settings {@code basic} always forces basic, a
     * settings {@code advanced} upgrades everything except an explicit basic request.
     */
    static DocparseMode effectiveMode(DocparseMode settings, DocparseMode requested) {
        DocparseMode request = requested == null ? DocparseMode.AUTO : requested;
        if (settings == DocparseMode.BASIC) {
            return DocparseMode.BASIC;
        }
        if (settings == DocparseMode.ADVANCED) {
            return request == DocparseMode.BASIC ? DocparseMode.BASIC : DocparseMode.ADVANCED;
        }
        return request;
    }

    /** Extract per-page text for the engine, capped by the shared aiEngine limits. */
    List<AiPageText> extractPages(PDDocument document) throws IOException {
        ApplicationProperties.AiEngine.Limits limits =
                applicationProperties.getAiEngine().getLimits();
        int maxPages = Math.min(document.getNumberOfPages(), limits.getMaxPages());
        int remainingCharacters = limits.getMaxCharacters();
        List<AiPageText> pages = new ArrayList<>();
        for (int page = 1; page <= maxPages && remainingCharacters > 0; page++) {
            String text = pdfContentExtractor.extractPageTextRaw(document, page);
            if (text == null || text.isBlank()) {
                continue;
            }
            if (text.length() > remainingCharacters) {
                text = text.substring(0, remainingCharacters);
            }
            pages.add(new AiPageText(page, text));
            remainingCharacters -= text.length();
        }
        return pages;
    }

    private DocparseMode settingsMode() {
        try {
            return DocparseMode.fromWire(applicationProperties.getDocparse().getMode());
        } catch (IllegalArgumentException e) {
            log.warn(
                    "Unknown docparse.mode '{}'; falling back to auto",
                    applicationProperties.getDocparse().getMode());
            return DocparseMode.AUTO;
        }
    }

    public static String fileName(MultipartFile file) {
        String name = Filenames.toSimpleFileName(file.getOriginalFilename());
        return (name == null || name.isBlank()) ? "document.pdf" : name;
    }

    private String currentUserId() {
        return userService != null ? userService.getCurrentUsername() : null;
    }
}
