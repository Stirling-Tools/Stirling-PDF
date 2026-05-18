package stirling.software.SPDF.controller.api.security;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;

/**
 * PDFTextStripper subclass that collects all text positions and groups them into line-level
 * bounding boxes.
 *
 * <p>Two outputs are maintained in parallel:
 *
 * <ul>
 *   <li>{@link #getLineBoxes()} returns {@code [x1, pdfYbottom, x2, pdfYtop]} in PDF user-space
 *       (origin bottom-left, Y up). This is what existing callers expect.
 *   <li>{@link #getScreenLineBoxes()} returns {@code [x1, screenYtop, x2, screenYbottom]} computed
 *       directly from glyph positions without a PDF↔screen round-trip — used by column-aware
 *       redaction where ulp-level drift in the round-trip caused false rejects against anchors.
 * </ul>
 *
 * <p>Lines are flushed not only on Y jumps but also on large X gaps within the same Y row. That way
 * left-column glyphs and right-column glyphs that happen to share a baseline (common in IEEE
 * conference templates) get emitted as two distinct line boxes instead of one wide merged box.
 */
final class AllTextLineExtractor extends PDFTextStripper {

    /** Min vertical jump (screen Y) before the next glyph is treated as a new line. */
    private static final float LINE_Y_TOLERANCE = 3.0f;

    /**
     * Min horizontal gap (screen X) between consecutive glyphs on the same Y that indicates a
     * column boundary. Chosen large enough to not split normal inter-word spacing (~6–10pt for 11pt
     * text) but small enough to catch standard column gutters (typically ≥15pt).
     */
    private static final float COLUMN_GAP_X = 14f;

    private final float pageHeight;
    private final List<float[]> lineBoxes = new ArrayList<>();
    private final List<float[]> screenLineBoxes = new ArrayList<>();

    private final List<TextPosition> currentLine = new ArrayList<>();
    private float lastScreenY = Float.NaN;
    private float lastGlyphRight = Float.NaN;

    AllTextLineExtractor(int pageNumber, float pageHeight) throws IOException {
        this.pageHeight = pageHeight;
        setStartPage(pageNumber);
        setEndPage(pageNumber);
        setSortByPosition(true);
    }

    List<float[]> getLineBoxes() {
        return lineBoxes;
    }

    /**
     * Returns line boxes as {@code [x1, screenYtop, x2, screenYbottom]}. {@code screenYtop} is the
     * minimum {@code TextPosition.getY() - getHeight()} on the line and {@code screenYbottom} is
     * the maximum {@code getY()} (the line's baseline). These values come straight from PDFBox
     * without going through {@code pageHeight - …}, so they're stable for ulp-sensitive comparisons
     * against anchor screen Ys.
     */
    List<float[]> getScreenLineBoxes() {
        return screenLineBoxes;
    }

    @Override
    protected void writeString(String text, List<TextPosition> positions) {
        for (TextPosition tp : positions) {
            // Skip whitespace-only positions (spaces, newline markers, indent characters).
            // These have a TextPosition but no visible glyph; including them causes
            // space-only "lines" to produce degenerate segments that appear as thin
            // black bars after redaction.
            String unicode = tp.getUnicode();
            if (unicode == null || unicode.isBlank()) {
                continue;
            }
            float screenY = tp.getY();
            float screenX = tp.getX();
            boolean yJump =
                    !Float.isNaN(lastScreenY) && Math.abs(screenY - lastScreenY) > LINE_Y_TOLERANCE;
            boolean xJump =
                    !Float.isNaN(lastGlyphRight) && (screenX - lastGlyphRight) > COLUMN_GAP_X;
            if (yJump || xJump) {
                flushLine();
            }
            lastScreenY = screenY;
            lastGlyphRight = screenX + tp.getWidth();
            currentLine.add(tp);
        }
    }

    @Override
    protected void endPage(PDPage page) throws IOException {
        flushLine();
        super.endPage(page);
    }

    private void flushLine() {
        if (currentLine.isEmpty()) {
            return;
        }
        float minX = Float.MAX_VALUE, maxX = -Float.MAX_VALUE;
        float minScreenY = Float.MAX_VALUE, maxScreenY = -Float.MAX_VALUE;
        for (TextPosition tp : currentLine) {
            minX = Math.min(minX, tp.getX());
            maxX = Math.max(maxX, tp.getX() + tp.getWidth());
            minScreenY = Math.min(minScreenY, tp.getY() - tp.getHeight());
            maxScreenY = Math.max(maxScreenY, tp.getY());
        }
        emitSegment(minX, maxX, minScreenY, maxScreenY);
        currentLine.clear();
        lastScreenY = Float.NaN;
        lastGlyphRight = Float.NaN;
    }

    private void emitSegment(float minX, float maxX, float minScreenY, float maxScreenY) {
        float pdfY1 = pageHeight - maxScreenY; // bottom in PDF coords
        float pdfY2 = pageHeight - minScreenY; // top in PDF coords
        lineBoxes.add(new float[] {minX, pdfY1, maxX, pdfY2});
        screenLineBoxes.add(new float[] {minX, minScreenY, maxX, maxScreenY});
    }
}
