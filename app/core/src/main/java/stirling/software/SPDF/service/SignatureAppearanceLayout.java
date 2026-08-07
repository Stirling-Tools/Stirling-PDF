package stirling.software.SPDF.service;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.apache.pdfbox.pdmodel.font.PDFont;

/**
 * Works out how to draw a set of label/value lines inside a signature box of a given size.
 *
 * <p>The box is whatever the user dragged on the page, so the text has to adapt to it rather than
 * the other way round: a wide, short box and a narrow, tall one holding the same fields need
 * different type sizes. Rather than let the text spill outside the box - which produces a signature
 * that overlaps the document and looks broken - the font is scaled down until everything fits, and
 * lines that still cannot fit are dropped.
 */
public final class SignatureAppearanceLayout {

    /** Largest type size considered. Beyond this a short signature looks like a headline. */
    private static final float MAX_FONT_SIZE = 12f;

    /** Below this, text stops being legible in print, so dropping a line is the better trade. */
    private static final float MIN_FONT_SIZE = 4f;

    private static final float FONT_SIZE_STEP = 0.25f;

    /** Line height as a multiple of the font size. */
    private static final float LEADING_RATIO = 1.25f;

    /** Padding between the text and the edges of the box, as a multiple of the font size. */
    private static final float PADDING_RATIO = 0.4f;

    private SignatureAppearanceLayout() {}

    /**
     * The chosen type size and the lines that fit at it.
     *
     * @param fontSize type size in points
     * @param leading distance between baselines in points
     * @param padding gap left around the text in points
     * @param lines the text to draw, one entry per line, already trimmed to what fits
     */
    public record Layout(float fontSize, float leading, float padding, List<String> lines) {

        /** Y offset of the first baseline, measured from the top of the box. */
        public float firstBaselineFromTop() {
            return padding + fontSize;
        }
    }

    /**
     * Chooses the largest type size at which the given lines fit inside the box.
     *
     * @param entries label/value pairs to render, in display order
     * @param font the font the text will be drawn with
     * @param boxWidth box width in points
     * @param boxHeight box height in points
     * @return the layout to draw; its {@code lines} may be shorter than {@code entries} when the
     *     box is too small to hold them all even at the minimum size
     */
    public static Layout fit(
            Map<String, String> entries, PDFont font, float boxWidth, float boxHeight)
            throws IOException {
        List<String> allLines = new ArrayList<>(entries.size());
        for (Map.Entry<String, String> entry : entries.entrySet()) {
            allLines.add(entry.getKey() + ": " + entry.getValue());
        }
        if (allLines.isEmpty()) {
            return new Layout(MIN_FONT_SIZE, MIN_FONT_SIZE * LEADING_RATIO, 0f, List.of());
        }

        for (float size = MAX_FONT_SIZE; size >= MIN_FONT_SIZE; size -= FONT_SIZE_STEP) {
            float padding = size * PADDING_RATIO;
            float leading = size * LEADING_RATIO;
            float availableWidth = boxWidth - 2 * padding;
            float availableHeight = boxHeight - 2 * padding;

            if (availableWidth <= 0 || availableHeight < size) {
                continue;
            }
            if (allLines.size() * leading > availableHeight) {
                continue;
            }
            if (widestLine(allLines, font, size) > availableWidth) {
                continue;
            }
            return new Layout(size, leading, padding, List.copyOf(allLines));
        }

        // Nothing fits whole: keep as many leading lines as the box holds at the smallest size,
        // so a cramped box still shows the signer's name rather than nothing at all.
        return truncateToFit(allLines, font, boxWidth, boxHeight);
    }

    private static Layout truncateToFit(
            List<String> allLines, PDFont font, float boxWidth, float boxHeight)
            throws IOException {
        float size = MIN_FONT_SIZE;
        float padding = Math.min(size * PADDING_RATIO, boxHeight / 4f);
        float leading = size * LEADING_RATIO;
        float availableHeight = boxHeight - 2 * padding;
        float availableWidth = boxWidth - 2 * padding;

        int fitting = (int) Math.floor(availableHeight / leading);
        if (fitting <= 0 || availableWidth <= 0) {
            return new Layout(size, leading, padding, List.of());
        }

        List<String> kept = new ArrayList<>(Math.min(fitting, allLines.size()));
        for (int i = 0; i < Math.min(fitting, allLines.size()); i++) {
            kept.add(ellipsise(allLines.get(i), font, size, availableWidth));
        }
        return new Layout(size, leading, padding, kept);
    }

    /** Shortens a line with a trailing ellipsis until it fits the available width. */
    private static String ellipsise(String line, PDFont font, float fontSize, float maxWidth)
            throws IOException {
        if (textWidth(line, font, fontSize) <= maxWidth) {
            return line;
        }
        String candidate = line;
        while (candidate.length() > 1) {
            candidate = candidate.substring(0, candidate.length() - 1);
            if (textWidth(candidate + "...", font, fontSize) <= maxWidth) {
                return candidate + "...";
            }
        }
        return candidate;
    }

    private static float widestLine(List<String> lines, PDFont font, float fontSize)
            throws IOException {
        float widest = 0f;
        for (String line : lines) {
            widest = Math.max(widest, textWidth(line, font, fontSize));
        }
        return widest;
    }

    private static float textWidth(String text, PDFont font, float fontSize) throws IOException {
        return font.getStringWidth(text) / 1000f * fontSize;
    }
}
