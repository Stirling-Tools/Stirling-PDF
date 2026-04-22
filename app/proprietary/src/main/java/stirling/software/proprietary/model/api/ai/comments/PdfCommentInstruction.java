package stirling.software.proprietary.model.api.ai.comments;

/**
 * A single comment instruction returned by the Python PDF Comment Agent.
 *
 * @param chunkId The {@link TextChunk#id()} the comment should anchor to.
 * @param commentText The comment body (required, non-null).
 * @param author Optional author/title for the popup. May be {@code null}.
 * @param subject Optional subject line for the popup. May be {@code null}.
 */
public record PdfCommentInstruction(
        String chunkId, String commentText, String author, String subject) {}
