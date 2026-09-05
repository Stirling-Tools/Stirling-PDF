package stirling.software.SPDF.service;

import java.awt.Color;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDFontDescriptor;

/**
 * Works out how to draw a set of label/value fields inside a signature box of a given size.
 *
 * <p>The box is whatever the user dragged on the page, so the type adapts to it rather than the
 * other way round: the same fields in a wide short box and in a narrow tall one need different
 * sizes, and three fields in a large box need a larger size than fourteen do. The type is therefore
 * scaled in both directions until the block fills the box, and long values are broken across lines,
 * so that one long name cannot force the whole signature down to small print.
 *
 * <p>The result is a list of lines with their positions already resolved. Both the signature and
 * the marks stamped on the other pages draw that list through {@link #draw}, which is what keeps
 * the two renderings identical without either of them repeating the arithmetic.
 */
public final class SignatureAppearanceLayout {

    /** Below this, type stops being legible in print, so lines are dropped instead. */
    private static final float MIN_FONT_SIZE = 4f;

    /** Past this a signature reads as a headline rather than as a mark on a document. */
    private static final float MAX_FONT_SIZE = 72f;

    /**
     * Grid the chosen size is snapped to.
     *
     * <p>Searching whole quarter-points keeps every answer exactly representable as a float, so the
     * same box and fields give the same size on any machine and a test can assert one without a
     * tolerance.
     */
    private static final float SIZE_STEP = 0.25f;

    /** Line height as a multiple of the font size, before any of the leftover height is shared. */
    private static final float LEADING_RATIO = 1.25f;

    /**
     * Line height ceiling, as a multiple of the font size.
     *
     * <p>Two short lines in a tall box cannot fill it by growing - the type is stopped by the width
     * long before the height runs out - so the leftover is given to the leading instead. The
     * ceiling is what stops that turning into two lines pinned to opposite edges of the box.
     */
    private static final float MAX_LEADING_RATIO = 1.75f;

    /**
     * Margin around the text, as a share of the smaller side of the box.
     *
     * <p>Deriving it from the box rather than from the type is what lets the type grow: a margin
     * proportional to the font size grows with the very thing it constrains, so a search for the
     * size that fills the box would chase its own tail. The value matches the inset {@link
     * SignatureLogoPlacement} leaves around the logo, so the two sit on one optical margin.
     */
    private static final float PADDING_SHARE = 0.04f;

    /** How much larger the headline field is drawn than the rest. */
    private static final float HEADLINE_RATIO = 1.6f;

    /**
     * Narrowest line worth drawing, in multiples of the font size.
     *
     * <p>An area too narrow to hold a dozen characters cannot say who signed, and a mark that says
     * nothing is worse than no mark: the caller skips the page instead.
     */
    private static final float MIN_LINE_WIDTH = 8f;

    /**
     * Ink extents of Times-Bold, used when a font declares no bounding box.
     *
     * <p>These come from the font's bounding box and not from its ascent and descent on purpose.
     * Ascent covers an unaccented capital; an accented one - routine in the Spanish and Portuguese
     * names this feature exists to stamp - reaches higher, and would be shaved by the top of the
     * box.
     */
    private static final float FALLBACK_TOP = 0.935f;

    private static final float FALLBACK_BOTTOM = 0.218f;

    private SignatureAppearanceLayout() {}

    /**
     * One certificate field as it will be drawn.
     *
     * @param headline draws this field larger than the rest, to give the signature a subject the
     *     eye lands on first. At most one field should carry it.
     */
    public record Field(String label, String value, boolean headline) {}

    /**
     * A single drawn line, positioned relative to the top-left corner of the area given to the
     * text.
     *
     * @param x offset from the left edge of that area, carrying the indent of a continuation line
     * @param baselineFromTop offset of the baseline, measured down from the top edge of that area
     */
    public record Line(String text, float fontSize, float x, float baselineFromTop) {}

    /**
     * The lines to draw and the body size they were sized at.
     *
     * @param fontSize size of the ordinary fields; a headline field is drawn larger than this
     */
    public record Layout(float fontSize, List<Line> lines) {

        public boolean isEmpty() {
            return lines.isEmpty();
        }
    }

    /** A line before its baseline is known, while only its horizontal placement is settled. */
    /**
     * One drawn line.
     *
     * @param field index of the field it came from, so a line cut short can be told from a whole
     *     one that happens to be last
     */
    private record Piece(String text, float fontSize, float x, int field) {}

    /** How far the type reaches above and below its baseline, in multiples of the font size. */
    private record Ink(float top, float bottom) {}

    /**
     * Chooses the type size at which the fields fill the box, and lays them out at it.
     *
     * @param fields label/value pairs to render, in display order
     * @param boxWidth width of the area the text may use, in points
     * @param boxHeight height of that area, in points
     * @return the lines to draw; may hold less than {@code fields} asked for when the box cannot
     *     take it all even at the smallest legible size
     */
    public static Layout fit(List<Field> fields, PDFont font, float boxWidth, float boxHeight)
            throws IOException {
        if (fields == null || fields.isEmpty() || !isDrawable(boxWidth, boxHeight)) {
            return new Layout(MIN_FONT_SIZE, List.of());
        }

        Ink ink = inkOf(font);
        float padding = Math.min(boxWidth, boxHeight) * PADDING_SHARE;
        float availableWidth = boxWidth - 2 * padding;
        float availableHeight = boxHeight - 2 * padding;
        if (availableHeight <= 0 || availableWidth < MIN_LINE_WIDTH * MIN_FONT_SIZE) {
            return new Layout(MIN_FONT_SIZE, List.of());
        }

        int smallest = Math.round(MIN_FONT_SIZE / SIZE_STEP);
        int largest =
                (int)
                        Math.floor(
                                Math.min(
                                                MAX_FONT_SIZE,
                                                availableHeight / (ink.top() + ink.bottom()))
                                        / SIZE_STEP);
        if (largest < smallest
                || !fits(fields, font, MIN_FONT_SIZE, ink, availableWidth, availableHeight)) {
            return truncateToFit(fields, font, ink, padding, availableWidth, availableHeight);
        }

        // Breaking lines only ever adds them as the type grows, so a size that fits implies every
        // smaller one does, and the largest that fits can be bisected for.
        while (smallest < largest) {
            int middle = smallest + (largest - smallest + 1) / 2;
            if (fits(fields, font, middle * SIZE_STEP, ink, availableWidth, availableHeight)) {
                smallest = middle;
            } else {
                largest = middle - 1;
            }
        }

        float size = smallest * SIZE_STEP;
        List<Piece> pieces = compose(fields, font, size, availableWidth);
        return new Layout(size, position(pieces, ink, padding, availableHeight));
    }

    /**
     * Draws a laid-out block into the area it was measured against.
     *
     * <p>Each line is its own text object because a headline field is drawn at a different size
     * from the rest, and because the baselines are already absolute: there is no leading to carry
     * from one line to the next, and so no way for the two callers to sequence them differently.
     */
    public static void draw(
            PDPageContentStream cs, PDFont font, PDRectangle textArea, Layout layout)
            throws IOException {
        if (layout.isEmpty()) {
            return;
        }
        cs.setNonStrokingColor(Color.BLACK);
        for (Line line : layout.lines()) {
            cs.beginText();
            cs.setFont(font, line.fontSize());
            cs.newLineAtOffset(
                    textArea.getLowerLeftX() + line.x(),
                    textArea.getUpperRightY() - line.baselineFromTop());
            cs.showText(line.text());
            cs.endText();
        }
    }

    private static boolean fits(
            List<Field> fields,
            PDFont font,
            float size,
            Ink ink,
            float availableWidth,
            float availableHeight)
            throws IOException {
        List<Piece> pieces = compose(fields, font, size, availableWidth);
        if (pieces.isEmpty()) {
            return false;
        }
        for (Piece piece : pieces) {
            if (piece.x() + textWidth(piece.text(), font, piece.fontSize()) > availableWidth) {
                return false;
            }
        }
        return blockHeight(pieces, ink, 1f) <= availableHeight;
    }

    /** Breaks every field into the lines it needs at this size, with their indents resolved. */
    private static List<Piece> compose(
            List<Field> fields, PDFont font, float size, float availableWidth) throws IOException {
        List<Piece> pieces = new ArrayList<>();
        for (int f = 0; f < fields.size(); f++) {
            Field field = fields.get(f);
            float fieldSize = field.headline() ? size * HEADLINE_RATIO : size;
            String head = field.label() + ": ";
            float indent = textWidth(head, font, fieldSize);
            // An indent past the middle of the box costs more width than the alignment is worth.
            float continuation = indent < availableWidth / 2f ? indent : 0f;

            List<String> wrapped =
                    wrap(
                            head + field.value(),
                            font,
                            fieldSize,
                            availableWidth,
                            availableWidth - continuation);
            for (int i = 0; i < wrapped.size(); i++) {
                pieces.add(new Piece(wrapped.get(i), fieldSize, i == 0 ? 0f : continuation, f));
            }
        }
        return pieces;
    }

    /**
     * Splits text so the first line fits {@code firstWidth} and any others fit {@code restWidth}.
     *
     * <p>Filling each line as far as it goes before starting the next is what makes the line count
     * rise with the type size and never fall, which is the property the size search relies on. A
     * cleverer breaker that balanced the lines would not have it.
     *
     * <p>Words are kept whole where they can be, and a word longer than the line is broken by
     * characters: a certificate serial number has no spaces to break at, and refusing to break it
     * would push the whole signature down a size for the sake of one field.
     */
    private static List<String> wrap(
            String text, PDFont font, float size, float firstWidth, float restWidth)
            throws IOException {
        List<String> lines = new ArrayList<>();
        String remaining = text.trim();
        while (!remaining.isEmpty()) {
            float width = lines.isEmpty() ? firstWidth : restWidth;
            if (width <= 0 || textWidth(remaining, font, size) <= width) {
                lines.add(remaining);
                break;
            }
            int cut = longestPrefix(remaining, font, size, width);
            int space = remaining.lastIndexOf(' ', cut);
            if (space > 0) {
                lines.add(remaining.substring(0, space));
                remaining = remaining.substring(space + 1).trim();
            } else {
                lines.add(remaining.substring(0, cut));
                remaining = remaining.substring(cut).trim();
            }
        }
        return lines;
    }

    /** Length of the longest prefix that fits the width, never less than one character. */
    private static int longestPrefix(String text, PDFont font, float size, float width)
            throws IOException {
        int low = 1;
        int high = text.length();
        while (low < high) {
            int middle = (low + high + 1) / 2;
            if (textWidth(text.substring(0, middle), font, size) <= width) {
                low = middle;
            } else {
                high = middle - 1;
            }
        }
        return low;
    }

    /** Distance from the top of the first line to the bottom of the last. */
    private static float blockHeight(List<Piece> pieces, Ink ink, float leadingScale) {
        float height = pieces.get(0).fontSize() * ink.top();
        for (int i = 1; i < pieces.size(); i++) {
            height += pieces.get(i).fontSize() * LEADING_RATIO * leadingScale;
        }
        return height + pieces.get(pieces.size() - 1).fontSize() * ink.bottom();
    }

    /**
     * Turns measured pieces into positioned lines.
     *
     * <p>Height left over once the type has grown as far as the width allows is given to the
     * leading, up to its ceiling, and only what remains after that is split above and below the
     * block. Opening the lines out reads as a deliberate setting; the same gap left at the bottom
     * reads as a signature that failed to fill its box.
     */
    private static List<Line> position(
            List<Piece> pieces, Ink ink, float padding, float availableHeight) {
        float leadingScale = 1f;
        float gaps = blockHeight(pieces, ink, 1f) - blockHeight(pieces, ink, 0f);
        if (gaps > 0) {
            float wanted = (availableHeight - blockHeight(pieces, ink, 0f)) / gaps;
            leadingScale = Math.min(MAX_LEADING_RATIO / LEADING_RATIO, Math.max(1f, wanted));
        }

        float slack = Math.max(0f, availableHeight - blockHeight(pieces, ink, leadingScale));
        float baseline = padding + slack / 2f + pieces.get(0).fontSize() * ink.top();

        List<Line> lines = new ArrayList<>(pieces.size());
        for (int i = 0; i < pieces.size(); i++) {
            Piece piece = pieces.get(i);
            if (i > 0) {
                baseline += piece.fontSize() * LEADING_RATIO * leadingScale;
            }
            lines.add(new Line(piece.text(), piece.fontSize(), padding + piece.x(), baseline));
        }
        return lines;
    }

    /**
     * Keeps as much as the box holds at the smallest legible size.
     *
     * <p>Reached only for a box that cannot take even one field at that size once the text has been
     * broken across lines. Showing the signer and losing the rest still beats showing nothing.
     *
     * <p>What the mark is attached to matters. Against the last character of a value the box cut in
     * half it reads as "this value continues", which is true. Against a whole value it would read
     * the same way and be false, so there it goes after a space instead: a signature that misstates
     * the serial number it certifies is worse than one that quietly shows a field fewer.
     */
    private static Layout truncateToFit(
            List<Field> fields,
            PDFont font,
            Ink ink,
            float padding,
            float availableWidth,
            float availableHeight)
            throws IOException {
        List<Piece> pieces = compose(fields, font, MIN_FONT_SIZE, availableWidth);
        List<Piece> kept = new ArrayList<>();
        for (Piece piece : pieces) {
            kept.add(piece);
            if (blockHeight(kept, ink, 1f) > availableHeight) {
                kept.remove(kept.size() - 1);
                break;
            }
        }
        if (kept.isEmpty()) {
            return new Layout(MIN_FONT_SIZE, List.of());
        }

        Piece last = kept.get(kept.size() - 1);
        if (kept.size() < pieces.size()) {
            boolean cutMidValue = pieces.get(kept.size()).field() == last.field();
            String marked =
                    mark(
                            last.text(),
                            font,
                            last.fontSize(),
                            availableWidth - last.x(),
                            cutMidValue);
            kept.set(kept.size() - 1, new Piece(marked, last.fontSize(), last.x(), last.field()));
        }
        return new Layout(MIN_FONT_SIZE, position(kept, ink, padding, availableHeight));
    }

    /**
     * Notes on a line that the box held more than it shows.
     *
     * @param midValue true when the line is a value the box cut in half, so the mark joins the last
     *     character it kept; false when whole fields were dropped after it, so the mark follows a
     *     space and the value itself is left alone even if that means no mark at all
     */
    private static String mark(
            String line, PDFont font, float fontSize, float maxWidth, boolean midValue)
            throws IOException {
        if (!midValue) {
            String spaced = line + " ...";
            return textWidth(spaced, font, fontSize) <= maxWidth ? spaced : line;
        }
        String candidate = line;
        while (!candidate.isEmpty()) {
            if (textWidth(candidate + "...", font, fontSize) <= maxWidth) {
                return candidate + "...";
            }
            candidate = candidate.substring(0, candidate.length() - 1);
        }
        return line;
    }

    private static float textWidth(String text, PDFont font, float fontSize) throws IOException {
        return font.getStringWidth(text) / 1000f * fontSize;
    }

    private static boolean isDrawable(float boxWidth, float boxHeight) {
        return Float.isFinite(boxWidth)
                && Float.isFinite(boxHeight)
                && boxWidth > 0
                && boxHeight > 0;
    }

    /**
     * Reads the font's ink extents from its bounding box.
     *
     * <p>The descriptor is the only source that is the same on every machine: a Standard 14 font is
     * not embedded, so {@code PDFont.getBoundingBox()} answers from whatever face the platform
     * substitutes.
     */
    private static Ink inkOf(PDFont font) {
        PDFontDescriptor descriptor = font.getFontDescriptor();
        PDRectangle box = descriptor != null ? descriptor.getFontBoundingBox() : null;
        if (box == null
                || !Float.isFinite(box.getUpperRightY())
                || !Float.isFinite(box.getLowerLeftY())
                || box.getUpperRightY() <= 0) {
            return new Ink(FALLBACK_TOP, FALLBACK_BOTTOM);
        }
        return new Ink(box.getUpperRightY() / 1000f, Math.max(0f, -box.getLowerLeftY()) / 1000f);
    }
}
