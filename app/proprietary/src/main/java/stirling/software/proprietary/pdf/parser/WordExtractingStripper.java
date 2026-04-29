package stirling.software.proprietary.pdf.parser;

import static stirling.software.proprietary.pdf.parser.PdfModels.*;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;

/**
 * Extends {@link PDFTextStripper} to capture per-fragment geometry and font metadata.
 *
 * <p>Overrides {@link #writeString} to split each content-stream string into word-level {@link
 * TextFragment}s with bounding boxes, baseline, font name, and bold flag. Coordinates are in
 * PDFTextStripper space: (0,0) top-left, Y increases downward, {@code getY()} is the baseline.
 */
class WordExtractingStripper extends PDFTextStripper {

    private final int targetPage;
    private final List<TextFragment> fragments = new ArrayList<>();
    private int fragmentIndex = 0;

    WordExtractingStripper(int pageNumber) throws IOException {
        this.targetPage = pageNumber;
        setStartPage(pageNumber);
        setEndPage(pageNumber);
        setSortByPosition(true);
    }

    @Override
    protected void startPage(PDPage page) throws IOException {
        super.startPage(page);
        fragments.clear();
        fragmentIndex = 0;
    }

    @Override
    protected void writeString(String text, List<TextPosition> textPositions) throws IOException {
        if (text == null || text.isBlank()) return;

        // Fast path: no whitespace → emit one fragment (most financial PDFs have each
        // number as its own string operation, so this is the common case).
        if (text.indexOf(' ') < 0) {
            emitFragment(text, textPositions);
            return;
        }

        // Per-word splitting requires 1:1 text-char to TextPosition correspondence.
        // Fall back to one fragment when sizes differ (ligatures, encoding edge cases).
        if (textPositions.size() != text.length()) {
            emitFragment(text, textPositions);
            return;
        }

        // Emit one TextFragment per whitespace-delimited word with accurate per-word bounds.
        int start = 0;
        for (int i = 0; i <= text.length(); i++) {
            if (i == text.length() || text.charAt(i) == ' ') {
                if (start < i) {
                    emitFragment(text.substring(start, i), textPositions.subList(start, i));
                }
                start = i + 1;
            }
        }
    }

    private void emitFragment(String text, List<TextPosition> positions) {
        if (positions.isEmpty()) return;

        float minX = Float.MAX_VALUE;
        float minY = Float.MAX_VALUE;
        float maxRight = -Float.MAX_VALUE;
        float maxBaseline = -Float.MAX_VALUE;
        TextPosition first = null;

        for (TextPosition tp : positions) {
            if (tp == null) continue;
            if (first == null) first = tp;

            float x = tp.getX();
            // getY() is the baseline; top of character = getY() - getHeight().
            float top = tp.getY() - tp.getHeight();
            float right = x + tp.getWidth();
            float baseline = tp.getY();

            minX = Math.min(minX, x);
            minY = Math.min(minY, top);
            maxRight = Math.max(maxRight, right);
            maxBaseline = Math.max(maxBaseline, baseline);
        }

        if (first == null) return;

        PDFont font = first.getFont();
        String fontName = font != null ? font.getName() : "";
        boolean bold = fontName != null && fontName.toLowerCase().contains("bold");
        // getHeight() gives the rendered glyph height, which is the most reliable visual size.
        float fontSize = first.getHeight();

        Bounds bounds = new Bounds(minX, minY, maxRight - minX, maxBaseline - minY);
        String id = "tf-p" + targetPage + "-" + fragmentIndex++;
        fragments.add(new TextFragment(id, text, bounds, maxBaseline, fontSize, fontName, bold));
    }

    List<TextFragment> getFragments() {
        return Collections.unmodifiableList(fragments);
    }
}
