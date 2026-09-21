package stirling.software.proprietary.service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import io.github.pixee.security.Filenames;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.pdf.MarkdownBlock;
import stirling.software.common.pdf.MarkdownBlocks;
import stirling.software.common.pdf.PdfMarkdownExtractor;
import stirling.software.common.service.UserServiceInterface;
import stirling.software.common.util.TempFile;
import stirling.software.common.util.TempFileManager;
import stirling.software.jpdfium.PdfDocument;
import stirling.software.proprietary.model.api.docparse.IngestApiRequest;
import stirling.software.proprietary.model.docparse.DocChunk;
import stirling.software.proprietary.model.docparse.IngestOutcome;
import stirling.software.proprietary.model.docparse.IngestRequest;
import stirling.software.proprietary.model.docparse.IngestResponse;

import tools.jackson.databind.ObjectMapper;

/**
 * DocParse ingestion: layout-aware Markdown conversion (the same {@link PdfMarkdownExtractor} that
 * backs {@code /pdf/markdown}) plus engine dispatch for chunk + embed + index. The engine owns
 * chunking, embedding, and the document store; Java owns identity, limits, and the wire contract
 * from {@code engine/src/stirling/contracts/docparse.py}.
 *
 * <p>jpdfium serialises natively (NativeGuard's process-wide lock); a LARGE_WEIGHT ingest holds it
 * for the whole document, so concurrent ingests queue behind each other and behind /pdf/markdown.
 */
@Slf4j
@Service
public class DocParseService {

    private static final String INGEST_ENDPOINT = "/api/v1/docparse/ingest";

    private final AiEngineClient aiEngineClient;
    private final PdfMarkdownExtractor markdownExtractor;
    private final TempFileManager tempFileManager;
    private final ApplicationProperties applicationProperties;
    private final ObjectMapper objectMapper;
    private final FileIdStrategy fileIdStrategy;
    private final UserServiceInterface userService;

    public DocParseService(
            AiEngineClient aiEngineClient,
            PdfMarkdownExtractor markdownExtractor,
            TempFileManager tempFileManager,
            ApplicationProperties applicationProperties,
            ObjectMapper objectMapper,
            FileIdStrategy fileIdStrategy,
            @Autowired(required = false) UserServiceInterface userService) {
        this.aiEngineClient = aiEngineClient;
        this.markdownExtractor = markdownExtractor;
        this.tempFileManager = tempFileManager;
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

    /**
     * Convert the document to Markdown blocks, then chunk, embed, and index them into the engine's
     * knowledge base and/or hand them back for corpus export.
     */
    public IngestOutcome ingest(IngestApiRequest apiRequest) throws IOException {
        requireEnabled();
        MultipartFile file = apiRequest.getFileInput();
        boolean index = apiRequest.isIndex();
        boolean includeChunks = apiRequest.isExportChunksJsonl();
        if (!index && !apiRequest.isExportMarkdown() && !includeChunks) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Nothing to do: enable index, exportMarkdown, or exportChunksJsonl");
        }
        String documentId = apiRequest.getDocumentId();
        // Content hash default: re-ingesting identical bytes dedupes to the same document.
        String docId =
                (documentId == null || documentId.isBlank())
                        ? fileIdStrategy.idFor(file)
                        : documentId.trim();
        int size = Math.clamp(apiRequest.getChunkSize(), 64, 32_768);
        // Both bounds are satisfiable independently, so a caller can pass overlap >= chunkSize and
        // reach the engine's chunker with a zero or negative stride.
        int step = Math.clamp(apiRequest.getOverlap(), 0, 4_096);
        if (step >= size) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "overlap (" + step + ") must be smaller than chunkSize (" + size + ")");
        }

        List<MarkdownBlock> all;
        int sourcePages;
        try (TempFile tempInput = new TempFile(tempFileManager, ".pdf")) {
            // Copy rather than transferTo: transferTo moves the servlet part's backing file away,
            // and the controller still reads the upload afterwards to build the export ZIP.
            Files.copy(
                    file.getInputStream(),
                    tempInput.getPath(),
                    StandardCopyOption.REPLACE_EXISTING);
            try (PdfDocument doc = PdfDocument.open(tempInput.getPath())) {
                sourcePages = doc.pageCount();
                all = markdownExtractor.extractBlocks(doc);
            }
        }

        Capped capped = applyLimits(all, sourcePages);
        List<MarkdownBlock> blocks = capped.blocks();
        if (hasNoText(blocks)) {
            // Caught here rather than at the engine: Java is what found no text, and the engine
            // cannot tell a scan from a genuinely empty file.
            throw new ResponseStatusException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "No extractable text: this document has no text layer. OCR it before ingesting.");
        }
        String markdown = MarkdownBlocks.join(blocks);
        int pages = pagesCovered(blocks);

        int chunksIndexed = 0;
        List<DocChunk> chunks = null;
        // Chunking lives in the engine, so an export-markdown-only run needs no round trip at all.
        if (index || includeChunks) {
            String callerId = currentUserId();
            // Null expiresAt = persistent until explicit delete; ingest here is a deliberate
            // knowledge-base action, unlike the TTL'd auto-ingest in AiWorkflowService.
            IngestRequest request =
                    new IngestRequest(
                            docId,
                            fileName(file),
                            callerId,
                            // Engine forbids an empty list here (min_length=1); null means
                            // "default to the owner" on the engine side.
                            callerId == null ? null : List.of(callerId),
                            null,
                            blocks,
                            size,
                            step,
                            index,
                            includeChunks);
            String responseJson =
                    aiEngineClient.postLongRunning(
                            INGEST_ENDPOINT, objectMapper.writeValueAsString(request), callerId);
            IngestResponse response = objectMapper.readValue(responseJson, IngestResponse.class);
            chunksIndexed = response.chunksIndexed();
            chunks = response.chunks();
        }
        if (capped.truncated()) {
            log.warn("Ingest of {} reached the configured extraction limits", docId);
        }
        return new IngestOutcome(
                docId, chunksIndexed, chunks, markdown, pages, sourcePages, capped.truncated());
    }

    /** Apply the shared aiEngine caps over the block list, keeping whole blocks. */
    Capped applyLimits(List<MarkdownBlock> all, int sourcePages) {
        ApplicationProperties.AiEngine.Limits limits =
                applicationProperties.getAiEngine().getLimits();
        int maxPages = limits.getMaxPages();
        int remaining = limits.getMaxCharacters();
        boolean truncated = sourcePages > maxPages;
        List<MarkdownBlock> kept = new ArrayList<>();
        for (MarkdownBlock block : all) {
            // Blocks come out in reading order, so pageStart never goes backwards.
            if (block.pageStart() > maxPages) {
                truncated = true;
                break;
            }
            String md = block.markdown();
            if (md.isBlank()) {
                continue;
            }
            if (remaining == 0) {
                truncated = true;
                break;
            }
            if (md.length() > remaining) {
                truncated = true;
                md = md.substring(0, remaining);
            }
            kept.add(block.withMarkdown(md));
            remaining -= md.length();
        }
        return new Capped(kept, truncated);
    }

    record Capped(List<MarkdownBlock> blocks, boolean truncated) {}

    /** A scan converts to image placeholders rather than to nothing, so emptiness misses it. */
    private static boolean hasNoText(List<MarkdownBlock> blocks) {
        return blocks.stream()
                .allMatch(block -> MarkdownBlocks.isImagePlaceholder(block.markdown()));
    }

    private static int pagesCovered(List<MarkdownBlock> blocks) {
        Set<Integer> covered = new TreeSet<>();
        for (MarkdownBlock block : blocks) {
            for (int p = block.pageStart(); p <= block.pageEnd(); p++) {
                covered.add(p);
            }
        }
        return covered.size();
    }

    public static String fileName(MultipartFile file) {
        String name = Filenames.toSimpleFileName(file.getOriginalFilename());
        return (name == null || name.isBlank()) ? "document.pdf" : name;
    }

    private String currentUserId() {
        return userService != null ? userService.getCurrentUsername() : null;
    }
}
