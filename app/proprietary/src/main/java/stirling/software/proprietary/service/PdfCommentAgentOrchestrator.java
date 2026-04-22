package stirling.software.proprietary.service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Calendar;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.apache.commons.io.FilenameUtils;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.graphics.color.PDColor;
import org.apache.pdfbox.pdmodel.graphics.color.PDDeviceRGB;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationText;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;
import stirling.software.proprietary.model.api.ai.comments.PdfCommentEngineRequest;
import stirling.software.proprietary.model.api.ai.comments.PdfCommentEngineResponse;
import stirling.software.proprietary.model.api.ai.comments.PdfCommentInstruction;
import stirling.software.proprietary.model.api.ai.comments.TextChunk;

import tools.jackson.databind.ObjectMapper;

/**
 * Orchestrator for the PDF Comment Agent (pdfCommentAgent).
 *
 * <p>Responsibilities:
 *
 * <ol>
 *   <li>Validate inputs (PDF, non-empty prompt within length limit).
 *   <li>Extract positioned text chunks from the PDF.
 *   <li>POST the chunks + prompt to the Python agent at {@code
 *       /api/v1/ai/pdf-comment-agent/generate}.
 *   <li>Apply the returned comment instructions as {@link PDAnnotationText} annotations — using the
 *       chunk's known bounding box so positioning is fully deterministic on the Java side.
 *   <li>Return the annotated PDF bytes + suggested filename as an {@link AnnotatedPdf} record.
 * </ol>
 *
 * <p>The raw PDF never leaves Java; Python only sees structured text chunks.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PdfCommentAgentOrchestrator {

    private static final String GENERATE_PATH = "/api/v1/ai/pdf-comment-agent/generate";
    private static final int MAX_PROMPT_LEN = 4000;

    /** Width/height of the sticky-note icon placed on the page, in PDF user-space units. */
    private static final float ANNOTATION_SIZE = 20f;

    /** Yellow sticky-note fill colour (R, G, B in 0..1 range). */
    private static final float[] STICKY_NOTE_COLOR_RGB = {1f, 0.95f, 0.4f};

    /** Opacity for the sticky-note icon. */
    private static final float ANNOTATION_OPACITY = 0.9f;

    /** PDF Text-annotation icon name — {@code "Comment"} is one of the standard icons. */
    private static final String ANNOTATION_ICON_NAME = "Comment";

    /** Default subject shown in the annotation popup when the agent does not supply one. */
    private static final String DEFAULT_COMMENT_SUBJECT = "Stirling AI Comment";

    /** Default author label shown in the annotation popup when the agent does not supply one. */
    private static final String DEFAULT_COMMENT_AUTHOR = "Stirling AI";

    /** Filename used when the uploaded PDF has no usable original filename. */
    private static final String FALLBACK_OUTPUT_NAME = "document-commented.pdf";

    /**
     * Small value record returned to the controller: the annotated PDF bytes plus the suggested
     * download filename (used in the {@code Content-Disposition} header).
     */
    public record AnnotatedPdf(byte[] bytes, String fileName) {}

    private final AiEngineClient aiEngineClient;
    private final PdfTextChunkExtractor pdfTextChunkExtractor;
    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final ObjectMapper objectMapper;

    /**
     * Run the full PDF Comment Agent flow.
     *
     * @param pdfFile the uploaded PDF
     * @param prompt the user's natural-language instructions
     * @return the annotated PDF bytes and suggested filename
     */
    public AnnotatedPdf applyComments(MultipartFile pdfFile, String prompt) throws IOException {
        String trimmedPrompt = prompt == null ? "" : prompt.trim();
        if (trimmedPrompt.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Prompt is required");
        }
        if (trimmedPrompt.length() > MAX_PROMPT_LEN) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Prompt exceeds maximum length of " + MAX_PROMPT_LEN + " characters");
        }
        String contentType = pdfFile.getContentType();
        if (contentType == null || !contentType.equals(MediaType.APPLICATION_PDF_VALUE)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Only application/pdf uploads are supported");
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

            // Call the Python agent
            PdfCommentEngineRequest engineRequest =
                    new PdfCommentEngineRequest(sessionId, trimmedPrompt, chunks);
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

            // Apply the annotations
            applyAnnotations(document, chunks, instructions, sessionId);

            // Save to an in-memory buffer.
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
            return new AnnotatedPdf(annotatedBytes, outputName);
        }
    }

    // -----------------------------------------------------------------------
    // Annotation application
    // -----------------------------------------------------------------------

    private void applyAnnotations(
            PDDocument document,
            List<TextChunk> chunks,
            List<PdfCommentInstruction> instructions,
            String sessionId)
            throws IOException {
        if (instructions.isEmpty()) {
            return;
        }

        Map<String, TextChunk> chunksById = new HashMap<>();
        for (TextChunk chunk : chunks) {
            chunksById.put(chunk.id(), chunk);
        }

        int totalPages = document.getNumberOfPages();
        int applied = 0;
        Calendar now = Calendar.getInstance();

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
            if (chunk.page() < 0 || chunk.page() >= totalPages) {
                log.warn(
                        "[pdf-comment-agent] session={} chunkId={} references out-of-range page={}",
                        sessionId,
                        inst.chunkId(),
                        chunk.page());
                continue;
            }

            PDAnnotationText annot = new PDAnnotationText();
            annot.setContents(inst.commentText());
            // Anchor the sticky-note icon at the top-left of the chunk's bbox.
            float iconX = chunk.x();
            float iconY = chunk.y() + chunk.height() - ANNOTATION_SIZE;
            annot.setRectangle(new PDRectangle(iconX, iconY, ANNOTATION_SIZE, ANNOTATION_SIZE));
            annot.setSubject(
                    inst.subject() != null && !inst.subject().isBlank()
                            ? inst.subject()
                            : DEFAULT_COMMENT_SUBJECT);
            annot.setTitlePopup(
                    inst.author() != null && !inst.author().isBlank()
                            ? inst.author()
                            : DEFAULT_COMMENT_AUTHOR);
            annot.setColor(new PDColor(STICKY_NOTE_COLOR_RGB, PDDeviceRGB.INSTANCE));
            annot.setCreationDate(now);
            annot.setConstantOpacity(ANNOTATION_OPACITY);
            annot.getCOSObject().setName(COSName.NAME, ANNOTATION_ICON_NAME);

            document.getPage(chunk.page()).getAnnotations().add(annot);
            applied++;
        }

        log.info(
                "[pdf-comment-agent] session={} applied {}/{} annotations",
                sessionId,
                applied,
                instructions.size());
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
