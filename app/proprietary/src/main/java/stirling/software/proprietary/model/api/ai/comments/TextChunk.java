package stirling.software.proprietary.model.api.ai.comments;

/**
 * One positioned text chunk extracted from a PDF, sent to the Python PDF Comment Agent so it can
 * pick which chunks to annotate.
 *
 * <p>The bounding box is in PDF user-space coordinates (origin at the page's bottom-left).
 *
 * @param id Stable chunk id in the form {@code "p{pageIdx}-c{chunkIdx}"} (both 0-indexed).
 * @param page 0-indexed page number.
 * @param x Bottom-left x coordinate of the chunk bbox (PDF user-space).
 * @param y Bottom-left y coordinate of the chunk bbox (PDF user-space).
 * @param width Width of the chunk bbox.
 * @param height Height of the chunk bbox.
 * @param text The plain-text content of the chunk (truncated to a sane length).
 */
public record TextChunk(
        String id, int page, float x, float y, float width, float height, String text) {}
