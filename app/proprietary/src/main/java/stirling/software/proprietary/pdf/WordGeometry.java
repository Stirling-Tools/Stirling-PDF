package stirling.software.proprietary.pdf;

import java.util.List;
import java.util.regex.Pattern;

import stirling.software.jpdfium.text.TextChar;
import stirling.software.jpdfium.text.TextWord;

/**
 * Word-level geometry and spacing decisions.
 *
 * <p>PDFium splits words on its own bounding boxes, so whether two adjacent words were separated by
 * a real space has to be re-derived from the glyphs rather than trusted. Edges are measured from
 * the glyphs for the same reason: a word box can carry its trailing space.
 */
final class WordGeometry {

    private WordGeometry() {}

    /** Gap below this many average character widths reads as no space at all (mid-word split). */
    static final float NO_SPACE_GAP = 0.30f;

    /**
     * Punctuation that binds to the words on both sides of it. Closing a cell's words up is only
     * ever considered around one of these: two ordinary words set tight against each other are far
     * more likely to be a narrow real space than a mid-word split, and dropping it would corrupt
     * the text where a stray space merely looks untidy.
     */
    private static final String BINDING_MARKS = "'’ʼ´`-‐‑";

    /** True for a lone apostrophe or hyphen, as in {@code firm}, {@code '}, {@code s}. */
    static boolean isBindingMark(String word) {
        return word.length() == 1 && BINDING_MARKS.indexOf(word.charAt(0)) >= 0;
    }

    /**
     * A contraction or possessive whose apostrophe the extractor padded on both sides, e.g. {@code
     * firm ' s} or {@code Don ’ t}. Limited to the English suffixes because a lone apostrophe with
     * real space around it is an opening quote, which must keep its spacing.
     */
    private static final Pattern SPLIT_CONTRACTION =
            Pattern.compile("(\\p{L})\\s*([’'ʼ´`])\\s*(s|t|d|m|re|ve|ll)\\b");

    /** Closes up an apostrophe the extractor left standing alone inside a cell. */
    static String rejoinContractions(String cell) {
        return cell.indexOf(' ') < 0 ? cell : SPLIT_CONTRACTION.matcher(cell).replaceAll("$1$2$3");
    }

    /**
     * True when two words of one cell are far enough apart to be separated by a space. The
     * extractor splits on its own bounding boxes, so a punctuation mark set tight against its
     * neighbour ({@code firm}, {@code '}, {@code s}) arrives as three words; joining those with a
     * space unconditionally writes {@code firm ' s} into the cell.
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
