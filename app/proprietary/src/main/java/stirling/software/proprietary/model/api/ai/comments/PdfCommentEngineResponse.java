package stirling.software.proprietary.model.api.ai.comments;

import java.util.List;

/**
 * Response body returned by the Python PDF Comment Agent at {@code POST
 * /api/v1/ai/pdf-comment-agent/generate}.
 *
 * @param sessionId Echoes the session id from the request.
 * @param comments The comments the agent wants to place on the document.
 * @param rationale Short free-text explanation of the agent's choices.
 */
public record PdfCommentEngineResponse(
        String sessionId, List<PdfCommentInstruction> comments, String rationale) {}
