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
import stirling.software.proprietary.model.docparse.IngestOutcome;
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

    public DocparseCapabilitiesView capabilitiesView(boolean refresh) {
        ApplicationProperties.Docparse config = applicationProperties.getDocparse();
        DocparseCapabilities capabilities = capabilityService.refresh(refresh);
        return new DocparseCapabilitiesView(
                config.isEnabled(),
                config.getMode(),
                capabilities.advancedInstalled(),
                capabilityService.isEngineReachable(),
                capabilities.doclingVersion(),
                capabilities.indexingConfigured());
    }

    /**
     * Chunk, embed, and index the document into the engine's RAG store, and/or echo the parsed
     * content back for corpus export. Text extraction happens here (the engine's basic tier is
     * text-only); the settings mode caps the requested mode, and {@code advanced} without the addon
     * surfaces the engine's 501 addonRequired.
     */
    public IngestOutcome ragIngest(
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
        int size = Math.clamp(chunkSize, 64, 32_768);
        // Both bounds are satisfiable independently, so a caller can pass overlap >= chunkSize and
        // reach the engine's chunker with a zero or negative stride.
        int step = Math.clamp(overlap, 0, 4_096);
        if (step >= size) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "overlap (" + step + ") must be smaller than chunkSize (" + size + ")");
        }
        ExtractedPages extracted;
        int sourcePages;
        try (PDDocument document = pdfDocumentFactory.load(file, true)) {
            sourcePages = document.getNumberOfPages();
            extracted = extractPages(document);
        }
        List<AiPageText> pages = extracted.pages();
        if (pages.isEmpty()) {
            // Caught here rather than at the engine: Java is what found no text, and the engine's
            // reply cannot tell a scan from a genuinely empty file.
            throw new ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "No extractable text: this document has no text layer. OCR it before ingesting.");
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
                        size,
                        step,
                        effectiveMode(
                                settingsMode(), mode, capabilityService.isAdvancedInstalled()),
                        index,
                        includeMarkdown,
                        includeChunks);
        String responseJson =
                aiEngineClient.postLongRunning(
                        RAG_INGEST_ENDPOINT, objectMapper.writeValueAsString(request), callerId);
        RagIngestResponse response = objectMapper.readValue(responseJson, RagIngestResponse.class);
        if (extracted.truncated()) {
            log.warn("Ingest of {} reached the configured extraction limits", docId);
        }
        return new IngestOutcome(response, sourcePages, extracted.truncated());
    }

    /**
     * Resolve the tier actually dispatched. The settings mode wins when stricter, but a settings
     * {@code advanced} only upgrades an {@code auto} request when the addon is installed: the
     * engine rejects advanced outright without it, so upgrading unconditionally would turn every
     * ingest on a plain install into a 501. An <em>explicit</em> advanced request is still passed
     * through, so the caller gets the engine's actionable addonRequired detail instead of a silent
     * downgrade to a tier they did not ask for.
     */
    static DocparseMode effectiveMode(
            DocparseMode settings, DocparseMode requested, boolean advancedInstalled) {
        DocparseMode request = requested == null ? DocparseMode.AUTO : requested;
        if (request == DocparseMode.ADVANCED) {
            return DocparseMode.ADVANCED;
        }
        if (settings == DocparseMode.BASIC || request == DocparseMode.BASIC) {
            return DocparseMode.BASIC;
        }
        if (settings == DocparseMode.ADVANCED && advancedInstalled) {
            return DocparseMode.ADVANCED;
        }
        return DocparseMode.AUTO;
    }

    /** Extract per-page text for the engine, capped by the shared aiEngine limits. */
    ExtractedPages extractPages(PDDocument document) throws IOException {
        ApplicationProperties.AiEngine.Limits limits =
                applicationProperties.getAiEngine().getLimits();
        int maxPages = Math.min(document.getNumberOfPages(), limits.getMaxPages());
        int remainingCharacters = limits.getMaxCharacters();
        List<AiPageText> pages = new ArrayList<>();
        boolean truncated = maxPages < document.getNumberOfPages();
        for (int page = 1; page <= maxPages; page++) {
            String text = pdfContentExtractor.extractPageTextRaw(document, page);
            if (text == null || text.isBlank()) {
                continue;
            }
            if (remainingCharacters == 0) {
                truncated = true;
                break;
            }
            if (text.length() > remainingCharacters) {
                truncated = true;
                text = text.substring(0, remainingCharacters);
            }
            pages.add(new AiPageText(page, text));
            remainingCharacters -= text.length();
        }
        return new ExtractedPages(pages, truncated);
    }

    record ExtractedPages(List<AiPageText> pages, boolean truncated) {}

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
