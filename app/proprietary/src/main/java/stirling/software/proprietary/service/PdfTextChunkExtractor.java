package stirling.software.proprietary.service;

import java.io.IOException;
import java.io.Writer;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;
import org.springframework.stereotype.Service;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.model.api.ai.comments.TextChunk;

/**
 * Extracts positioned, line-level text chunks from a PDF so the PDF Comment Agent can decide where
 * to anchor annotations. One chunk per text line, with the bounding box converted to PDF user-space
 * coordinates (origin = bottom-left).
 */
@Slf4j
@Service
public class PdfTextChunkExtractor {

    /** Hard cap on total chunks emitted per document. */
    private static final int MAX_CHUNKS_PER_DOC = 2000;

    /** Truncate each chunk's text to at most this many characters. */
    private static final int MAX_CHUNK_TEXT_LENGTH = 500;

    /**
     * Extract line-level text chunks with bounding boxes from the given document.
     *
     * <p>Each chunk's coordinates are in PDF user-space (origin = bottom-left of the page). Chunks
     * that are whitespace-only after trimming are skipped.
     *
     * @param document the open PDF
     * @return positioned chunks (never {@code null})
     * @throws IOException on PDF parse errors
     */
    public List<TextChunk> extract(PDDocument document) throws IOException {
        List<TextChunk> chunks = new ArrayList<>();
        ChunkStripper stripper = new ChunkStripper(document, chunks);
        stripper.setSortByPosition(true);
        stripper.getText(document);
        return chunks;
    }

    /**
     * PDFTextStripper subclass that emits one {@link TextChunk} per call to {@code writeString}.
     * PDFBox invokes {@code writeString} once per visual line when {@link
     * PDFTextStripper#setSortByPosition(boolean)} is true, which gives us exactly the granularity
     * we want.
     */
    private static final class ChunkStripper extends PDFTextStripper {

        private final PDDocument document;
        private final List<TextChunk> chunks;
        private int currentPageIdx = 0; // 0-indexed, tracked via startPage
        private int chunkIdxOnPage = 0;
        private boolean capWarningLogged = false;

        ChunkStripper(PDDocument document, List<TextChunk> chunks) throws IOException {
            super();
            this.document = document;
            this.chunks = chunks;
        }

        @Override
        protected void startPage(org.apache.pdfbox.pdmodel.PDPage page) throws IOException {
            super.startPage(page);
            // getCurrentPageNo() is 1-based; convert to 0-based.
            currentPageIdx = getCurrentPageNo() - 1;
            chunkIdxOnPage = 0;
        }

        @Override
        protected void writeString(String text, List<TextPosition> textPositions)
                throws IOException {
            if (chunks.size() >= MAX_CHUNKS_PER_DOC) {
                if (!capWarningLogged) {
                    log.warn(
                            "[pdf-comment-agent] chunk cap of {} reached; remaining text will not"
                                    + " be extracted",
                            MAX_CHUNKS_PER_DOC);
                    capWarningLogged = true;
                }
                return;
            }
            if (textPositions == null || textPositions.isEmpty()) {
                return;
            }
            String trimmed = text == null ? "" : text.trim();
            if (trimmed.isEmpty()) {
                return;
            }

            // Compute the bounding box from the min/max of TextPosition adjusted coordinates.
            // getXDirAdj / getYDirAdj / getHeightDir / getWidthDirAdj already account for the
            // page's rotation so we can treat them as axis-aligned in the page's display frame.
            float minX = Float.POSITIVE_INFINITY;
            float maxRight = Float.NEGATIVE_INFINITY;
            float minYTopDown = Float.POSITIVE_INFINITY; // smallest y in top-down coords
            float maxHeight = 0f;

            for (TextPosition pos : textPositions) {
                float x = pos.getXDirAdj();
                float right = x + pos.getWidthDirAdj();
                float yTop = pos.getYDirAdj();
                float h = pos.getHeightDir();
                if (h <= 0f) {
                    h = pos.getFontSizeInPt();
                }
                if (x < minX) minX = x;
                if (right > maxRight) maxRight = right;
                if (yTop < minYTopDown) minYTopDown = yTop;
                if (h > maxHeight) maxHeight = h;
            }
            if (maxHeight <= 0f) {
                // Fallback if everything was zero — small but non-zero so the rect is valid.
                maxHeight = 10f;
            }

            float width = maxRight - minX;
            if (width <= 0f) {
                return;
            }

            // Convert y to PDF user-space (origin at bottom-left of the page).
            // getYDirAdj reports the top of each glyph, measured from the top of the page.
            PDRectangle mediaBox = document.getPage(currentPageIdx).getMediaBox();
            float pageHeight = mediaBox.getHeight();
            float bottomY = pageHeight - minYTopDown - maxHeight;

            String id = "p" + currentPageIdx + "-c" + chunkIdxOnPage;
            chunkIdxOnPage++;

            String storedText = trimmed;
            if (storedText.length() > MAX_CHUNK_TEXT_LENGTH) {
                storedText = storedText.substring(0, MAX_CHUNK_TEXT_LENGTH);
            }

            chunks.add(
                    new TextChunk(id, currentPageIdx, minX, bottomY, width, maxHeight, storedText));
        }

        @Override
        protected void writeCharacters(TextPosition text) {
            // no-op: we only emit chunks at writeString granularity
        }

        @Override
        public String getText(PDDocument doc) throws IOException {
            // We don't actually need the concatenated text — just the side-effects. Return early
            // to avoid building a (potentially massive) StringBuilder of the whole document.
            try (Writer discard =
                    new Writer() {
                        @Override
                        public void write(char[] cbuf, int off, int len) {
                            // discard
                        }

                        @Override
                        public void flush() {}

                        @Override
                        public void close() {}
                    }) {
                writeText(doc, discard);
            }
            return "";
        }
    }
}
