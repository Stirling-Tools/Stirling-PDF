package stirling.software.proprietary.pdf;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import stirling.software.jpdfium.text.TextChar;
import stirling.software.jpdfium.text.TextLine;
import stirling.software.jpdfium.text.TextWord;

/**
 * A mutable assembled line: text plus geometry. {@link #left()}/{@link #right()} come from the word
 * boxes, {@link #glyphLeft()}/{@link #glyphRight()} from the glyphs.
 */
final class Line {

    String text;
    float x;
    float y;
    float width;
    float height;
    final TextLine source;

    /** Extra extractor fragments merged into this line; empty for an unmerged line. */
    final List<TextLine> merged = new ArrayList<>();

    /** True for a line synthesised from an AcroForm value rather than page content. */
    boolean synthetic;

    Line(TextLine src) {
        this(src, src.text());
    }

    Line(TextLine src, String text) {
        this.source = src;
        this.text = text;
        this.x = src.x();
        this.y = src.y();
        this.width = src.width();
        this.height = src.height();
    }

    /** Every word on the line, in x order, across all merged fragments. */
    List<TextWord> words() {
        if (merged.isEmpty()) {
            return source.words();
        }
        List<TextWord> all = new ArrayList<>(source.words());
        for (TextLine extra : merged) {
            all.addAll(extra.words());
        }
        all.sort(Comparator.comparingDouble(TextWord::x));
        return all;
    }

    /** Text for the heading/bold classifiers; an unmerged line keeps the extractor's own string. */
    String detectText() {
        return merged.isEmpty() ? source.text() : text;
    }

    float detectHeight() {
        return merged.isEmpty() ? source.height() : height;
    }

    /** Top edge; PDF y grows upwards, so this is the larger of the two vertical bounds. */
    float top() {
        return y + height;
    }

    float centreY() {
        return y + height / 2f;
    }

    float centreX() {
        return x + width / 2f;
    }

    /** Left edge of the line's words, falling back to its bounding box when it has none. */
    float left() {
        float edge = Float.MAX_VALUE;
        for (TextWord w : words()) {
            edge = Math.min(edge, w.x());
        }
        return edge == Float.MAX_VALUE ? x : edge;
    }

    float right() {
        float edge = -Float.MAX_VALUE;
        for (TextWord w : words()) {
            edge = Math.max(edge, w.x() + w.width());
        }
        return edge == -Float.MAX_VALUE ? x + width : edge;
    }

    /** Left edge of the line's glyphs, ignoring any space a word box carries. */
    float glyphLeft() {
        float edge = Float.MAX_VALUE;
        for (TextWord w : words()) {
            for (TextChar c : w.chars()) {
                if (!c.isWhitespace() && !c.isNewline()) {
                    edge = Math.min(edge, c.x());
                }
            }
        }
        return edge == Float.MAX_VALUE ? x : edge;
    }

    float glyphRight() {
        float edge = -Float.MAX_VALUE;
        for (TextWord w : words()) {
            for (TextChar c : w.chars()) {
                if (!c.isWhitespace() && !c.isNewline()) {
                    edge = Math.max(edge, c.x() + c.width());
                }
            }
        }
        return edge == -Float.MAX_VALUE ? x + width : edge;
    }

    /** Records a fragment folded into this line so its word list still covers the whole extent. */
    void absorb(TextLine fragment) {
        merged.add(fragment);
    }

    void absorb(Line fragment) {
        merged.add(fragment.source);
        merged.addAll(fragment.merged);
    }
}
