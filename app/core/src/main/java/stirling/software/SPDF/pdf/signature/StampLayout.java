package stirling.software.SPDF.pdf.signature;

import java.util.ArrayList;
import java.util.List;
import java.util.function.ToDoubleFunction;

/**
 * Where the visible signature's parts go inside its box, in points with the origin at the box's
 * bottom-left. The box splits into two halves, side by side when the box is at least as wide as it
 * is tall and stacked otherwise. The first half holds the graphic (the logo or the signer's name in
 * large type), the second the labelled detail lines; with no graphic the details fill the box. Text
 * is as large as its area allows: lines wrap at spaces (or between characters in scripts written
 * without spaces) only when that makes the text clearly larger than shrinking a long line.
 *
 * <p>Mirrored by the frontend preview (signatureStampPreview.ts); change both together or the
 * placement preview stops matching the signed stamp.
 *
 * @param logo the logo's rectangle, or null when it is not the graphic
 * @param name the signer's name block, or null when it is not the graphic
 */
public record StampLayout(Rect logo, TextBlock name, TextBlock details) {

    public record Rect(float x, float y, float width, float height) {}

    /**
     * Lines of one size, each aligned to the side its script reads from.
     *
     * @param lefts each line's left edge
     * @param baselines each line's baseline, measured up from the bottom of the box
     */
    public record TextBlock(
            float fontSize, List<String> lines, List<Float> lefts, List<Float> baselines) {}

    static final float LEADING = 1.2f;
    static final float ASCENT = 0.75f;
    static final float PADDING_SCALE = 0.04f;
    static final float WRAP_GAIN = 1.25f;
    private static final float SHRINK_STEP = 0.97f;

    /** A drawn line; one wrapped from a right-to-left paragraph keeps its direction. */
    private record Line(String text, boolean rightToLeft) {}

    private record Fit(float fontSize, List<Line> lines) {}

    /**
     * Lays out the stamp in a {@code width} x {@code height} box.
     *
     * @param name the signer's name, drawn in the graphic half when there is no logo, or null with
     *     no logo for a stamp without a graphic
     * @param logoAspect the logo's width over its height, or 0 when the logo is not the graphic
     * @param details the detail lines, already labelled
     * @param measure a line's width at font size 1
     */
    public static StampLayout of(
            float width,
            float height,
            String name,
            float logoAspect,
            List<String> details,
            ToDoubleFunction<String> measure) {
        float padding = Math.min(width, height) * PADDING_SCALE;
        if (logoAspect <= 0 && name == null) {
            Rect whole = new Rect(padding, padding, width - 2 * padding, height - 2 * padding);
            return new StampLayout(null, null, block(whole, details, measure));
        }
        Rect graphic;
        Rect text;
        if (width >= height) {
            float half = (width - 3 * padding) / 2;
            graphic = new Rect(padding, padding, half, height - 2 * padding);
            text = new Rect(2 * padding + half, padding, half, height - 2 * padding);
        } else {
            float half = (height - 3 * padding) / 2;
            graphic = new Rect(padding, 2 * padding + half, width - 2 * padding, half);
            text = new Rect(padding, padding, width - 2 * padding, half);
        }

        TextBlock detailBlock = block(text, details, measure);
        if (logoAspect > 0) {
            return new StampLayout(centred(graphic, logoAspect), null, detailBlock);
        }
        return new StampLayout(null, block(graphic, List.of(name), measure), detailBlock);
    }

    /**
     * Where a watermark goes: centred behind everything, as large as the padded box allows.
     *
     * @param aspect the watermark image's width over its height
     */
    public static Rect watermark(float width, float height, float aspect) {
        float padding = Math.min(width, height) * PADDING_SCALE;
        return centred(
                new Rect(padding, padding, width - 2 * padding, height - 2 * padding), aspect);
    }

    private static Rect centred(Rect area, float aspect) {
        float fittedWidth = area.width();
        float fittedHeight = fittedWidth / aspect;
        if (fittedHeight > area.height()) {
            fittedHeight = area.height();
            fittedWidth = fittedHeight * aspect;
        }
        return new Rect(
                area.x() + (area.width() - fittedWidth) / 2,
                area.y() + (area.height() - fittedHeight) / 2,
                fittedWidth,
                fittedHeight);
    }

    private static TextBlock block(
            Rect area, List<String> lines, ToDoubleFunction<String> measure) {
        // Every line is fitted as if it ended in a space, so text never runs flush into the
        // other half or the box edge.
        ToDoubleFunction<String> spaced = line -> measure.applyAsDouble(line + " ");
        Fit fit = fit(Math.max(area.width(), 0), Math.max(area.height(), 0), lines, spaced);
        float fontSize = fit.fontSize();
        float leading = fontSize * LEADING;
        float block = fontSize + (fit.lines().size() - 1) * leading;
        float first = area.y() + (area.height() + block) / 2 - fontSize * ASCENT;
        List<String> texts = new ArrayList<>();
        List<Float> lefts = new ArrayList<>();
        List<Float> baselines = new ArrayList<>();
        for (int index = 0; index < fit.lines().size(); index++) {
            Line line = fit.lines().get(index);
            texts.add(line.text());
            lefts.add(
                    line.rightToLeft()
                            ? area.x()
                                    + area.width()
                                    - (float) measure.applyAsDouble(line.text()) * fontSize
                            : area.x());
            baselines.add(first - index * leading);
        }
        return new TextBlock(fontSize, texts, lefts, baselines);
    }

    private static Fit fit(
            float width, float height, List<String> lines, ToDoubleFunction<String> measure) {
        float widest = 0;
        for (String line : lines) {
            widest = Math.max(widest, (float) measure.applyAsDouble(line));
        }
        float unwrapped = height / ((lines.size() - 1) * LEADING + 1);
        if (widest > 0) {
            unwrapped = Math.min(unwrapped, width / widest);
        }

        for (float size = height; size > unwrapped * WRAP_GAIN; size *= SHRINK_STEP) {
            List<Line> wrapped = wrapAll(lines, width / size, measure);
            if (wrapped != null && size * ((wrapped.size() - 1) * LEADING + 1) <= height) {
                return new Fit(size, wrapped);
            }
        }
        return new Fit(
                unwrapped,
                lines.stream().map(line -> new Line(line, readsRightToLeft(line))).toList());
    }

    private static List<Line> wrapAll(
            List<String> paragraphs, float limit, ToDoubleFunction<String> measure) {
        List<Line> lines = new ArrayList<>();
        for (String paragraph : paragraphs) {
            List<String> wrapped = wrap(paragraph, limit, measure);
            if (wrapped == null) {
                return null;
            }
            boolean rightToLeft = readsRightToLeft(paragraph);
            for (String text : wrapped) {
                lines.add(new Line(text, rightToLeft));
            }
        }
        return lines;
    }

    /** Scripts written without spaces, so a line may break between any two characters. */
    private static boolean breaksAnywhere(int codePoint) {
        return switch (Character.UnicodeScript.of(codePoint)) {
            case HAN, HIRAGANA, KATAKANA, HANGUL -> true;
            default -> false;
        };
    }

    /** Whether the first letter of {@code line} is in a right-to-left script. */
    static boolean readsRightToLeft(String line) {
        return line.codePoints().filter(Character::isLetter).findFirst().stream()
                .anyMatch(
                        codePoint ->
                                switch (Character.UnicodeScript.of(codePoint)) {
                                    case HEBREW, ARABIC, SYRIAC, THAANA, NKO -> true;
                                    default -> false;
                                });
    }

    /**
     * {@code line} broken to {@code limit} units at size 1, or null when it cannot be: a word wider
     * than the limit breaks between characters only in a script written without spaces.
     */
    private static List<String> wrap(String line, float limit, ToDoubleFunction<String> measure) {
        List<String> wrapped = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String word : line.split(" ")) {
            String candidate = current.isEmpty() ? word : current + " " + word;
            if (measure.applyAsDouble(candidate) <= limit) {
                current.setLength(0);
                current.append(candidate);
                continue;
            }
            if (!current.isEmpty()) {
                wrapped.add(current.toString());
                current.setLength(0);
            }
            if (measure.applyAsDouble(word) <= limit) {
                current.append(word);
                continue;
            }
            if (!word.codePoints().allMatch(StampLayout::breaksAnywhere)) {
                return null;
            }
            for (int i = 0; i < word.length(); ) {
                int codePoint = word.codePointAt(i);
                i += Character.charCount(codePoint);
                String next = current.toString() + Character.toString(codePoint);
                if (measure.applyAsDouble(next) <= limit) {
                    current.appendCodePoint(codePoint);
                } else if (current.isEmpty()) {
                    return null;
                } else {
                    wrapped.add(current.toString());
                    current.setLength(0);
                    current.appendCodePoint(codePoint);
                }
            }
        }
        if (!current.isEmpty()) {
            wrapped.add(current.toString());
        }
        return wrapped;
    }
}
