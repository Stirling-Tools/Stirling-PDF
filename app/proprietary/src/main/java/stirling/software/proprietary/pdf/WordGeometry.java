package stirling.software.proprietary.pdf;

import java.util.List;
import java.util.regex.Pattern;

import stirling.software.jpdfium.text.TextChar;
import stirling.software.jpdfium.text.TextWord;

/**
 * Word-level geometry and spacing. PDFium splits words on its own bounding boxes, so both real
 * spaces and edges are re-derived from the glyphs.
 */
final class WordGeometry {

    private WordGeometry() {}

    /** Gap below this many average character widths reads as no space at all (mid-word split). */
    static final float NO_SPACE_GAP = 0.30f;

    /**
     * Punctuation that binds to the words on both sides. Closing words up is only considered around
     * one of these, because dropping a real space corrupts the text.
     */
    private static final String BINDING_MARKS = "'’ʼ´`-‐‑";

    /** True for a lone apostrophe or hyphen, as in {@code firm}, {@code '}, {@code s}. */
    static boolean isBindingMark(String word) {
        return word.length() == 1 && BINDING_MARKS.indexOf(word.charAt(0)) >= 0;
    }

    /**
     * A contraction whose apostrophe the extractor padded on both sides. English suffixes only: a
     * spaced lone apostrophe is an opening quote.
     */
    private static final Pattern SPLIT_CONTRACTION =
            Pattern.compile("(\\p{L})\\s*([’'ʼ´`])\\s*(s|t|d|m|re|ve|ll)\\b");

    /** Closes up an apostrophe the extractor left standing alone inside a cell. */
    static String rejoinContractions(String cell) {
        return cell.indexOf(' ') < 0 ? cell : SPLIT_CONTRACTION.matcher(cell).replaceAll("$1$2$3");
    }

    /**
     * True when two words of a cell are far enough apart to be separated by a space; punctuation
     * set tight against its neighbour arrives as its own word.
     */
    static boolean separated(TextWord previous, TextWord current) {
        if (previous == null) {
            return true;
        }
        float gap = leftEdge(current) - rightEdge(previous);
        if (gap < 0f) {
            // Overlapping or out of order (a second line of a wrapped cell): keep the space.
            return true;
        }
        float charWidth = wordCharWidth(previous, current);
        return charWidth <= 0f || gap >= charWidth * NO_SPACE_GAP;
    }

    /** Mean glyph width across two words, used to size the space test above. */
    private static float wordCharWidth(TextWord a, TextWord b) {
        float width = 0f;
        int chars = 0;
        for (TextWord w : List.of(a, b)) {
            for (TextChar c : w.chars()) {
                if (!c.isWhitespace() && !c.isNewline()) {
                    width += c.width();
                    chars++;
                }
            }
        }
        return chars == 0 ? 0f : width / chars;
    }

    static float rightEdge(TextWord w) {
        float edge = -Float.MAX_VALUE;
        for (TextChar c : w.chars()) {
            if (!c.isWhitespace() && !c.isNewline()) {
                edge = Math.max(edge, c.x() + c.width());
            }
        }
        return edge == -Float.MAX_VALUE ? w.x() + w.width() : edge;
    }

    static float leftEdge(TextWord w) {
        float edge = Float.MAX_VALUE;
        for (TextChar c : w.chars()) {
            if (!c.isWhitespace() && !c.isNewline()) {
                edge = Math.min(edge, c.x());
            }
        }
        return edge == Float.MAX_VALUE ? w.x() : edge;
    }

    static float averageCharWidth(List<Line> rows) {
        double totalWidth = 0;
        int totalChars = 0;
        for (Line l : rows) {
            for (TextWord w : l.words()) {
                totalWidth += w.width();
                totalChars += Math.max(1, w.text().strip().length());
            }
        }
        return totalChars == 0 ? 6f : (float) (totalWidth / totalChars);
    }
}
