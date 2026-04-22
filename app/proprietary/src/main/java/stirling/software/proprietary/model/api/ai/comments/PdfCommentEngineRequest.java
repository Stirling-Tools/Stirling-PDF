package stirling.software.proprietary.model.api.ai.comments;

import java.util.List;

/**
 * Request body sent from Java to the Python PDF Comment Agent at {@code POST
 * /api/v1/ai/pdf-comment-agent/generate}.
 *
 * @param sessionId Random UUID that uniquely identifies this generate call.
 * @param userMessage The user's natural-language prompt (e.g. "flag any ambiguous dates").
 * @param chunks Positioned text chunks extracted from the PDF that the model may comment on.
 */
public record PdfCommentEngineRequest(
        String sessionId, String userMessage, List<TextChunk> chunks) {}
