package stirling.software.proprietary.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.apache.commons.io.FilenameUtils;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.api.comments.AnnotationLocation;
import stirling.software.common.model.api.comments.StickyNoteSpec;
import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.common.service.PdfAnnotationService;
import stirling.software.proprietary.model.api.ai.comments.PdfCommentEngineRequest;
import stirling.software.proprietary.model.api.ai.comments.PdfCommentEngineResponse;
import stirling.software.proprietary.model.api.ai.comments.PdfCommentInstruction;
import stirling.software.proprietary.model.api.ai.comments.TextChunk;

import tools.jackson.databind.ObjectMapper;

/**
 * Composed AI tool for PDF comment generation.
 *
 * <p>Runs the full flow:
 *
 * <ol>
 *   <li>Validate inputs (PDF, non-empty prompt within length limit).
 *   <li>Extract positioned text chunks from the PDF.
 *   <li>POST the chunks + prompt to the Python agent at {@code
 *       /api/v1/ai/pdf-comment-agent/generate}.
 *   <li>Resolve each returned chunk-id reference to an absolute {@link StickyNoteSpec}.
 *   <li>Hand the specs to {@link PdfAnnotationService} for deterministic placement.
 *   <li>Save the annotated PDF, return the bytes + filename.
 * </ol>
 *
 * <p>Annotation primitives live in {@link PdfAnnotationService} (shared with {@code
 * /api/v1/misc/add-comments}). This class owns only the AI-specific bits: chunk extraction and
 * engine round-trip.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PdfCommentAgentOrchestrator {

    private static final String GENERATE_PATH = "/api/v1/ai/pdf-comment-agent/generate";
    private static final int MAX_PROMPT_LEN = 4000;

    /** Width/height of the sticky-note icon placed on the page, in PDF user-space units. */
    private static final float ANNOTATION_SIZE = 20f;

    /** Filename used when the uploaded PDF has no usable original filename. */
    private static final String FALLBACK_OUTPUT_NAME = "document-commented.pdf";

    /**
     * Small value record returned to the controller: the annotated PDF bytes, the suggested
     * download filename (used in the {@code Content-Disposition} header), and metadata the
     * controller emits in the {@code X-Stirling-Tool-Report} header so callers (frontend,
     * orchestrator) can surface a chat-style summary alongside the file.
     */
    public record AnnotatedPdf(
            byte[] bytes,
            String fileName,
            int annotationsApplied,
            int instructionsReceived,
            String rationale) {}

    private final AiEngineClient aiEngineClient;
    private final PdfTextChunkExtractor pdfTextChunkExtractor;
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final ObjectMapper objectMapper;
    private final PdfAnnotationService pdfAnnotationService;

    /**
     * Run the full PDF comment generation flow.
     *
     * @param pdfFile the uploaded PDF
     * @param prompt the user's natural-language instructions
     * @return the annotated PDF bytes and suggested filename
     */
    public AnnotatedPdf applyComments(MultipartFile pdfFile, String prompt) throws IOException {
        AiToolInputValidator.validatePdfUpload(pdfFile);
        String trimmedPrompt = prompt == null ? "" : prompt.trim();
        if (trimmedPrompt.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Prompt is required");
        }
        if (trimmedPrompt.length() > MAX_PROMPT_LEN) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Prompt exceeds maximum length of " + MAX_PROMPT_LEN + " characters");
        }

        String sessionId = UUID.randomUUID().toString();
        log.info(
                "[pdf-comment-agent] session={} file={} promptLen={}",
                sessionId,
                safeName(pdfFile.getOriginalFilename()),
                trimmedPrompt.length());

        try (PDDocument document = pdfDocumentFactory.load(pdfFile)) {
            List<TextChunk> chunks = pdfTextChunkExtractor.extract(document);
            if (chunks.isEmpty()) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "PDF has no extractable text");
            }
            log.info(
                    "[pdf-comment-agent] session={} extracted {} chunks across {} pages",
                    sessionId,
                    chunks.size(),
                    document.getNumberOfPages());

            PdfCommentEngineResponse engineResponse =
                    requestComments(sessionId, trimmedPrompt, chunks);
            List<PdfCommentInstruction> instructions =
                    engineResponse.comments() == null ? List.of() : engineResponse.comments();

            // Resolve chunk-id-referenced comments to absolute sticky-note specs, then delegate
            // placement to the shared service (same primitive /api/v1/misc/add-comments uses).
            List<StickyNoteSpec> specs = resolveSpecs(instructions, chunks, sessionId);
            int applied = pdfAnnotationService.addStickyNotes(document, specs);
            log.info(
                    "[pdf-comment-agent] session={} placed {}/{} sticky notes",
                    sessionId,
                    applied,
                    instructions.size());

            byte[] annotatedBytes;
            try (ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                document.save(baos);
                annotatedBytes = baos.toByteArray();
            }

            String outputName = buildOutputFileName(pdfFile.getOriginalFilename());
            log.info(
                    "[pdf-comment-agent] session={} done fileName={} bytes={}",
                    sessionId,
                    outputName,
                    annotatedBytes.length);
            return new AnnotatedPdf(
                    annotatedBytes,
                    outputName,
                    applied,
                    instructions.size(),
                    engineResponse.rationale());
        }
    }

    // -----------------------------------------------------------------------
    // Engine round-trip
    // -----------------------------------------------------------------------

    private PdfCommentEngineResponse requestComments(
            String sessionId, String prompt, List<TextChunk> chunks) throws IOException {
        PdfCommentEngineRequest engineRequest =
                new PdfCommentEngineRequest(sessionId, prompt, chunks);
        String requestBody = objectMapper.writeValueAsString(engineRequest);
        String responseBody = aiEngineClient.post(GENERATE_PATH, requestBody);
        PdfCommentEngineResponse engineResponse =
                objectMapper.readValue(responseBody, PdfCommentEngineResponse.class);

        List<PdfCommentInstruction> instructions =
                engineResponse.comments() == null ? List.of() : engineResponse.comments();
        log.info(
                "[pdf-comment-agent] session={} engine returned {} comments: {}",
                sessionId,
                instructions.size(),
                engineResponse.rationale());
        return engineResponse;
    }

    // -----------------------------------------------------------------------
    // Chunk-id → StickyNoteSpec resolution
    // -----------------------------------------------------------------------

    /**
     * Translate each engine-returned {@link PdfCommentInstruction} (chunk-id-referenced) into an
     * absolute-positioned {@link StickyNoteSpec}. Unknown or malformed ids are logged and dropped.
     */
    private List<StickyNoteSpec> resolveSpecs(
            List<PdfCommentInstruction> instructions, List<TextChunk> chunks, String sessionId) {
        if (instructions.isEmpty()) {
            return List.of();
        }
        Map<String, TextChunk> chunksById = new HashMap<>();
        for (TextChunk chunk : chunks) {
            chunksById.put(chunk.id(), chunk);
        }

        List<StickyNoteSpec> specs = new ArrayList<>(instructions.size());
        for (PdfCommentInstruction inst : instructions) {
            if (inst == null || inst.chunkId() == null || inst.commentText() == null) {
                log.warn(
                        "[pdf-comment-agent] session={} skipping malformed instruction: {}",
                        sessionId,
                        inst);
                continue;
            }
            TextChunk chunk = chunksById.get(inst.chunkId());
            if (chunk == null) {
                log.warn(
                        "[pdf-comment-agent] session={} unknown chunkId={} - skipping",
                        sessionId,
                        inst.chunkId());
                continue;
            }

            // Anchor the sticky-note icon at the top-left of the chunk's bbox.
            float iconX = chunk.x();
            float iconY = chunk.y() + chunk.height() - ANNOTATION_SIZE;
            AnnotationLocation loc =
                    new AnnotationLocation(
                            chunk.page(), iconX, iconY, ANNOTATION_SIZE, ANNOTATION_SIZE);
            specs.add(new StickyNoteSpec(loc, inst.commentText(), inst.author(), inst.subject()));
        }
        return specs;
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private static String buildOutputFileName(String originalFilename) {
        String safe = safeName(originalFilename);
        if (safe == null || safe.isBlank() || "<unnamed>".equals(safe)) {
            return FALLBACK_OUTPUT_NAME;
        }
        String base = FilenameUtils.getBaseName(safe);
        if (base == null || base.isBlank()) {
            base = "document";
        }
        return base + "-commented.pdf";
    }

    private static String safeName(String originalFilename) {
        return originalFilename != null
                ? originalFilename.replaceAll("[\\r\\n]", "_")
                : "<unnamed>";
    }
}
