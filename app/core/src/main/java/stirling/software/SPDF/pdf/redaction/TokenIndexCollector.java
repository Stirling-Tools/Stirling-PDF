package stirling.software.SPDF.pdf.redaction;

import java.awt.geom.Rectangle2D;
import java.io.IOException;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSBase;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.text.TextPosition;

/**
 * Position-based (ToUnicode-independent) glyph locator: records, per text-showing operator, the
 * 0-based indexes of the non-blank glyphs whose box intersects a rect, plus each operator's total
 * glyph count. Blank glyphs are ignored so a space left behind by removal is not a "leak".
 */
final class TokenIndexCollector extends PDFTextStripper {
    private final List<Rectangle2D.Float> rects;
    final Map<Integer, Set<Integer>> dropGlyphsByOp = new HashMap<>();
    final Map<Integer, Integer> glyphCountByOp = new HashMap<>();
    private int showTextOpCounter = -1;
    private int glyphInOp = 0;

    TokenIndexCollector(List<Rectangle2D.Float> rects) throws IOException {
        this.rects = rects;
        setSortByPosition(false);
    }

    int totalTextOps() {
        return showTextOpCounter + 1;
    }

    boolean anyGlyphInRect() {
        return !dropGlyphsByOp.isEmpty();
    }

    @Override
    protected void processTextPosition(TextPosition text) {
        int op = showTextOpCounter;
        int idx = glyphInOp++;
        String u = text.getUnicode();
        if (u != null && !u.isBlank()) {
            // PDFBox reports coordinates with top-left origin here.
            float x = text.getX();
            float y = text.getY() - text.getHeight();
            Rectangle2D.Float glyph =
                    new Rectangle2D.Float(x, y, text.getWidth(), text.getHeight());
            for (Rectangle2D.Float rect : rects) {
                if (rect.intersects(glyph)) {
                    dropGlyphsByOp.computeIfAbsent(op, k -> new HashSet<>()).add(idx);
                    return;
                }
            }
        }
        super.processTextPosition(text);
    }

    @Override
    protected void processOperator(Operator operator, List<COSBase> operands) throws IOException {
        String name = operator.getName();
        boolean textOp = RedactionPipeline.TEXT_SHOWING_OPERATORS.contains(name);
        if (textOp) {
            showTextOpCounter++;
            glyphInOp = 0;
        }
        super.processOperator(operator, operands);
        if (textOp) {
            glyphCountByOp.put(showTextOpCounter, glyphInOp);
        }
    }
}
