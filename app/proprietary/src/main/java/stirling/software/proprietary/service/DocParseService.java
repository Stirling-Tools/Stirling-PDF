package stirling.software.proprietary.service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Base64;
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
import stirling.software.proprietary.model.docparse.ChunkDocumentRequest;
import stirling.software.proprietary.model.docparse.ChunkDocumentResponse;
import stirling.software.proprietary.model.docparse.DocBlock;
import stirling.software.proprietary.model.docparse.DocparseCapabilities;
import stirling.software.proprietary.model.docparse.DocparseCapabilitiesView;
import stirling.software.proprietary.model.docparse.DocparseMode;
import stirling.software.proprietary.model.docparse.DocparseTier;
import stirling.software.proprietary.model.docparse.DocumentStoreStats;
import stirling.software.proprietary.model.docparse.ExtractFieldsRequest;
import stirling.software.proprietary.model.docparse.ExtractFieldsResponse;
import stirling.software.proprietary.model.docparse.ExtractTablesRequest;
import stirling.software.proprietary.model.docparse.ExtractTablesResponse;
import stirling.software.proprietary.model.docparse.FillDocxRequest;
import stirling.software.proprietary.model.docparse.FillDocxResponse;
import stirling.software.proprietary.model.docparse.ParseDocumentRequest;
import stirling.software.proprietary.model.docparse.ParseDocumentResponse;
import stirling.software.proprietary.model.docparse.RagAskRequest;
import stirling.software.proprietary.model.docparse.RagIngestRequest;
import stirling.software.proprietary.model.docparse.RagIngestResponse;
import stirling.software.proprietary.model.docparse.RagSearchRequest;
import stirling.software.proprietary.model.docparse.RagStatsView;
import stirling.software.proprietary.model.docparse.SmartSplitRequest;
import stirling.software.proprietary.model.docparse.SmartSplitResponse;
import stirling.software.proprietary.model.docparse.SuggestSchemaRequest;
import stirling.software.proprietary.model.docparse.SuggestSchemaResponse;

import tools.jackson.databind.JsonNode;
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

    private static final String PARSE_ENDPOINT = "/api/v1/docparse/parse";
    private static final String EXTRACT_ENDPOINT = "/api/v1/docparse/extract";
    private static final String SPLIT_ENDPOINT = "/api/v1/docparse/split";
    private static final String CHUNK_ENDPOINT = "/api/v1/docparse/chunk";
    private static final String TABLES_ENDPOINT = "/api/v1/docparse/tables";
    private static final String FILL_DOCX_ENDPOINT = "/api/v1/docparse/fill-docx";
    private static final String SUGGEST_SCHEMA_ENDPOINT = "/api/v1/docparse/suggest-schema";
    private static final String RAG_INGEST_ENDPOINT = "/api/v1/docparse/rag-ingest";
    private static final String DOCUMENT_STATS_ENDPOINT = "/api/v1/documents/stats";
    private static final String DOCUMENT_LIST_ENDPOINT = "/api/v1/documents/list";
    private static final String DOCUMENT_SEARCH_ENDPOINT = "/api/v1/documents/search";
    private static final String DOCUMENT_ASK_ENDPOINT = "/api/v1/documents/ask";

    /** Below this average of extractable chars per page the document is treated as scanned. */
    static final int SCANNED_AVG_CHARS_PER_PAGE = 100;

    /** Pages sampled for the scanned heuristic; keeps the probe cheap on huge documents. */
    private static final int SCANNED_SAMPLE_PAGES = 20;

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

    public ParseDocumentResponse parse(
            MultipartFile file, DocparseMode requestedMode, boolean withOcr) throws IOException {
        requireEnabled();
        DocparseTier tier;
        try (PDDocument document = pdfDocumentFactory.load(file, true)) {
            tier =
                    resolveTier(
                            requestedMode,
                            capabilityService.capabilities(),
                            false,
                            looksScanned(document));
            if (tier == DocparseTier.BASIC) {
                return basicParse(document);
            }
        }
        ParseDocumentRequest request =
                new ParseDocumentRequest(fileName(file), encodeBase64(file), withOcr);
        String responseJson =
                aiEngineClient.postLongRunning(
                        PARSE_ENDPOINT, objectMapper.writeValueAsString(request), currentUserId());
        return objectMapper.readValue(responseJson, ParseDocumentResponse.class);
    }

    public SmartSplitResponse split(MultipartFile file, String rule, int maxParts)
            throws IOException {
        requireEnabled();
        if (rule == null || rule.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A split rule is required");
        }
        List<AiPageText> pages;
        try (PDDocument document = pdfDocumentFactory.load(file, true)) {
            pages = extractPages(document);
        }
        SmartSplitRequest request =
                new SmartSplitRequest(fileName(file), rule, pages, Math.clamp(maxParts, 1, 500));
        String responseJson =
                aiEngineClient.post(
                        SPLIT_ENDPOINT, objectMapper.writeValueAsString(request), currentUserId());
        return objectMapper.readValue(responseJson, SmartSplitResponse.class);
    }

    public ChunkDocumentResponse chunk(
            MultipartFile file, int chunkSize, int overlap, DocparseMode mode) throws IOException {
        requireEnabled();
        List<AiPageText> pages;
        DocparseTier tier;
        try (PDDocument document = pdfDocumentFactory.load(file, true)) {
            pages = extractPages(document);
            tier =
                    resolveTier(
                            mode, capabilityService.capabilities(), false, looksScanned(document));
        }
        ChunkDocumentRequest request =
                new ChunkDocumentRequest(
                        fileName(file),
                        pages,
                        tier == DocparseTier.ADVANCED ? encodeBase64(file) : null,
                        Math.clamp(chunkSize, 64, 32_768),
                        Math.clamp(overlap, 0, 4_096),
                        toMode(tier));
        String responseJson =
                aiEngineClient.postLongRunning(
                        CHUNK_ENDPOINT, objectMapper.writeValueAsString(request), currentUserId());
        return objectMapper.readValue(responseJson, ChunkDocumentResponse.class);
    }

    /**
     * Chunk, embed, and index the document into the engine's RAG store, and/or echo the parsed
     * content back for corpus export. Text extraction and tier routing happen here; the engine
     * handles both basic (text-only) and advanced (layout) tiers.
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
        DocparseTier tier;
        try (PDDocument document = pdfDocumentFactory.load(file, true)) {
            tier =
                    resolveTier(
                            mode, capabilityService.capabilities(), false, looksScanned(document));
            // The advanced tier parses the raw file engine-side; extracting pages
            // too would double both the PDFBox work and the payload.
            pages = tier == DocparseTier.BASIC ? extractPages(document) : null;
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
                        tier == DocparseTier.ADVANCED ? encodeBase64(file) : null,
                        Math.clamp(chunkSize, 64, 32_768),
                        Math.clamp(overlap, 0, 4_096),
                        toMode(tier),
                        index,
                        includeMarkdown,
                        includeChunks);
        String responseJson =
                aiEngineClient.postLongRunning(
                        RAG_INGEST_ENDPOINT, objectMapper.writeValueAsString(request), callerId);
        return objectMapper.readValue(responseJson, RagIngestResponse.class);
    }

    /**
     * Resolve the tier that will serve a request. The settings mode wins when stricter: a settings
     * {@code basic} always forces basic, a settings {@code advanced} upgrades everything except an
     * explicit basic request. {@code auto} picks advanced only when the addon is installed and the
     * document actually needs it (scanned, or the operation needs layout).
     */
    DocparseTier resolveTier(
            DocparseMode requested,
            DocparseCapabilities capability,
            boolean needsLayout,
            boolean looksScanned) {
        DocparseMode effective = effectiveMode(settingsMode(), requested);
        return switch (effective) {
            case BASIC -> DocparseTier.BASIC;
            case ADVANCED -> requireAdvanced(capability);
            case AUTO ->
                    capability.advancedInstalled() && (looksScanned || needsLayout)
                            ? DocparseTier.ADVANCED
                            : DocparseTier.BASIC;
        };
    }

    /** Extract the fields described by a JSON Schema, with confidence and citations. */
    public ExtractFieldsResponse extractFields(
            MultipartFile file, String fieldsSchemaJson, DocparseMode mode, String instructions)
            throws IOException {
        requireEnabled();
        JsonNode schema = parseJsonObject(fieldsSchemaJson, "fieldsSchema");
        List<AiPageText> pages;
        DocparseTier tier;
        try (PDDocument document = pdfDocumentFactory.load(file, true)) {
            pages = extractPages(document);
            tier =
                    resolveTier(
                            mode, capabilityService.capabilities(), false, looksScanned(document));
        }
        ExtractFieldsRequest request =
                new ExtractFieldsRequest(
                        fileName(file),
                        schema,
                        pages,
                        tier == DocparseTier.ADVANCED ? encodeBase64(file) : null,
                        toMode(tier),
                        instructions);
        String responseJson =
                aiEngineClient.postLongRunning(
                        EXTRACT_ENDPOINT,
                        objectMapper.writeValueAsString(request),
                        currentUserId());
        return objectMapper.readValue(responseJson, ExtractFieldsResponse.class);
    }

    /** Propose an extraction schema from the document's first pages. */
    public SuggestSchemaResponse suggestSchema(MultipartFile file, int maxFields)
            throws IOException {
        requireEnabled();
        List<AiPageText> pages;
        DocparseTier tier;
        try (PDDocument document = pdfDocumentFactory.load(file, true)) {
            pages = extractPages(document);
            tier =
                    resolveTier(
                            DocparseMode.AUTO,
                            capabilityService.capabilities(),
                            false,
                            looksScanned(document));
        }
        SuggestSchemaRequest request =
                new SuggestSchemaRequest(
                        fileName(file),
                        pages,
                        tier == DocparseTier.ADVANCED ? encodeBase64(file) : null,
                        Math.clamp(maxFields, 1, 20));
        String responseJson =
                aiEngineClient.postLongRunning(
                        SUGGEST_SCHEMA_ENDPOINT,
                        objectMapper.writeValueAsString(request),
                        currentUserId());
        return objectMapper.readValue(responseJson, SuggestSchemaResponse.class);
    }

    private JsonNode parseJsonObject(String json, String fieldName) {
        if (json == null || json.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "'" + fieldName + "' is required");
        }
        JsonNode node;
        try {
            node = objectMapper.readTree(json);
        } catch (Exception e) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "'" + fieldName + "' is not valid JSON");
        }
        if (!node.isObject()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "'" + fieldName + "' must be a JSON object");
        }
        return node;
    }

    private static void requireNonBlank(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "'" + fieldName + "' is required");
        }
    }

    /** Engine RAG store totals merged with the cached capability fields; graceful when down. */
    public RagStatsView ragStats() {
        DocparseCapabilities capabilities = capabilityService.capabilities();
        try {
            // The engine's documents routes are user-gated; an id-less probe 401s
            // and would read as "engine offline" in the UI.
            String json = aiEngineClient.get(DOCUMENT_STATS_ENDPOINT, currentUserId());
            DocumentStoreStats stats = objectMapper.readValue(json, DocumentStoreStats.class);
            return new RagStatsView(
                    stats.backend(),
                    stats.documents(),
                    stats.chunks(),
                    stats.embeddingModel(),
                    capabilities.advancedInstalled(),
                    capabilities.doclingVersion(),
                    true);
        } catch (Exception e) {
            log.debug("RAG stats probe failed: {}", e.getMessage());
            return new RagStatsView(
                    null,
                    0,
                    0,
                    null,
                    capabilities.advancedInstalled(),
                    capabilities.doclingVersion(),
                    false);
        }
    }

    /** Engine document-list passthrough; X-User-Id scopes it to the caller's ACLs. */
    public String ragDocuments() throws IOException {
        requireEnabled();
        return aiEngineClient.get(DOCUMENT_LIST_ENDPOINT, currentUserId());
    }

    /** Semantic-search passthrough over the caller-visible RAG documents. */
    public String ragSearch(String query, int topK) throws IOException {
        requireEnabled();
        requireNonBlank(query, "query");
        RagSearchRequest request = new RagSearchRequest(query, Math.clamp(topK, 1, 50));
        return aiEngineClient.post(
                DOCUMENT_SEARCH_ENDPOINT,
                objectMapper.writeValueAsString(request),
                currentUserId());
    }

    /** Grounded-answer passthrough; long-running because local models answer slowly. */
    public String ragAsk(String question, int topK) throws IOException {
        requireEnabled();
        requireNonBlank(question, "question");
        RagAskRequest request = new RagAskRequest(question, Math.clamp(topK, 1, 20));
        return aiEngineClient.postLongRunning(
                DOCUMENT_ASK_ENDPOINT, objectMapper.writeValueAsString(request), currentUserId());
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

    /** True when the sampled average of extractable chars per page falls below the threshold. */
    boolean looksScanned(PDDocument document) throws IOException {
        int pageCount = document.getNumberOfPages();
        if (pageCount == 0) {
            return false;
        }
        int sampled = Math.min(pageCount, SCANNED_SAMPLE_PAGES);
        long totalChars = 0;
        for (int page = 1; page <= sampled; page++) {
            String text = pdfContentExtractor.extractPageTextRaw(document, page);
            totalChars += text == null ? 0 : text.length();
        }
        return (totalChars / sampled) < SCANNED_AVG_CHARS_PER_PAGE;
    }

    private DocparseTier requireAdvanced(DocparseCapabilities capability) {
        if (!capability.advancedInstalled()) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_IMPLEMENTED,
                    "The advanced DocParse tier requires the docparse addon"
                            + " (addonRequired=docparse); install it or use mode=basic");
        }
        return DocparseTier.ADVANCED;
    }

    private static DocparseMode toMode(DocparseTier tier) {
        return tier == DocparseTier.ADVANCED ? DocparseMode.ADVANCED : DocparseMode.BASIC;
    }

    private static String encodeBase64(MultipartFile file) throws IOException {
        return Base64.getEncoder().encodeToString(file.getBytes());
    }

    public ExtractTablesResponse tables(MultipartFile file) throws IOException {
        requireEnabled();
        // Tables need layout, so a forced-advanced setting without the addon must 501 here
        // rather than let the engine silently fall back; the engine picks the tier otherwise.
        resolveTier(DocparseMode.AUTO, capabilityService.capabilities(), true, false);
        ExtractTablesRequest request = new ExtractTablesRequest(fileName(file), encodeBase64(file));
        String responseJson =
                aiEngineClient.postLongRunning(
                        TABLES_ENDPOINT, objectMapper.writeValueAsString(request), currentUserId());
        return objectMapper.readValue(responseJson, ExtractTablesResponse.class);
    }

    public FillDocxResponse fillDocx(MultipartFile templateFile, String dataJson)
            throws IOException {
        requireEnabled();
        JsonNode data = parseJsonObject(dataJson, "data");
        FillDocxRequest request =
                new FillDocxRequest(
                        Base64.getEncoder().encodeToString(templateFile.getBytes()), data);
        String responseJson =
                aiEngineClient.post(
                        FILL_DOCX_ENDPOINT,
                        objectMapper.writeValueAsString(request),
                        currentUserId());
        return objectMapper.readValue(responseJson, FillDocxResponse.class);
    }

    /** Basic tier parse: PDFBox text layer only, one paragraph block per non-blank page. */
    ParseDocumentResponse basicParse(PDDocument document) throws IOException {
        int pageCount = document.getNumberOfPages();
        List<DocBlock> blocks = new ArrayList<>();
        StringBuilder markdown = new StringBuilder();
        for (int page = 1; page <= pageCount; page++) {
            String text = pdfContentExtractor.extractPageTextRaw(document, page);
            if (text == null || text.isBlank()) {
                continue;
            }
            blocks.add(new DocBlock("paragraph", text, page, null, null));
            if (!markdown.isEmpty()) {
                markdown.append("\n\n");
            }
            markdown.append(text);
        }
        return new ParseDocumentResponse(
                DocparseTier.BASIC, pageCount, blocks, List.of(), markdown.toString(), false);
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
