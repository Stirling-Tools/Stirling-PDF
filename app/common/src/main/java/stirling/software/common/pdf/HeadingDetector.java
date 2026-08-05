package stirling.software.common.pdf;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

import stirling.software.jpdfium.text.PageText;
import stirling.software.jpdfium.text.TextChar;
import stirling.software.jpdfium.text.TextLine;
import stirling.software.jpdfium.text.TextWord;

final class HeadingDetector {

    private HeadingDetector() {}

    /** A heading is at most this many words; longer lines are treated as body text. */
    private static final int MAX_HEADING_WORDS = 12;

    /** Six-letter subset tag PDF writers prepend to embedded font names. */
    private static final Pattern SUBSET_TAG = Pattern.compile("^[A-Z]{6}\\+");

    /** PostScript name fragments denoting a weight heavier than the regular face. */
    private static final String[] BOLD_TOKENS = {
        "bold", "black", "heavy", "semibold", "demi", "ultra", "extrabold"
    };

    /**
     * URW/Nimbus name their bold face "-Medi"; TeX uses CMBX/CMSSBX for bold extended. "Medium" is
     * excluded: it is a weight lighter than bold, and matching it marks whole CJK body paragraphs
     * (HYSMyeongJo-Medium, HeiseiKakuGo) as bold labels.
     */
    private static final Pattern OTHER_BOLD = Pattern.compile("medi(?!um)|cm(ss)?bx");

    /**
     * A caption: the label of a float (a figure, a table, a chart) followed by its number. A float
     * caption is set in the same display typography as a heading — larger, bold, on its own line —
     * but it names an illustration, not a section, so it must never open one. "Table of contents"
     * does not match: the label has to be followed by a number.
     */
    private static final Pattern CAPTION =
            Pattern.compile(
                    "^(table|figure|fig|chart|exhibit|plate|scheme|graph|diagram|illustration)"
                            + "\\s*\\.?\\s*\\d",
                    Pattern.CASE_INSENSITIVE);

    /** A numbered section clause: {@code 3.}, {@code 6.2.}, {@code 7.2.1} followed by a name. */
    private static final Pattern CLAUSE = Pattern.compile("^\\d{1,2}(\\.\\d{1,2})*\\.?\\s+\\p{Lu}");

    /**
     * A sentence that ends and is followed by another: an ordinary word, a full stop, then a
     * capital. A heading names a section, so it is a phrase; it never runs two sentences together.
     * The line this rejects is the opening of a paragraph whose first phrase is set in bold — a
     * run-in lead-in — which otherwise reads as a bold, isolated, short line and is promoted.
     *
     * <p>The word before the stop must end in three lower-case letters, which is what keeps the
     * pattern off the section numbers and abbreviations that headings really do contain: {@code 4.
     * Entropy}, {@code III. Regulatory cholesterol}, {@code Print vs. Digital}, {@code Activity 5.
     * Calculating versus estimating CEC}. Measured over the benchmark ground truth this matches
     * none of its 193 headings.
     */
    private static final Pattern RUNS_ON = Pattern.compile("\\p{Ll}{3}[.!?][\\s\\u00a0]+\\p{Lu}");

    /** Size ratio at which a line is a level-1 heading on size alone. */
    private static final float H1_RATIO = 1.4f;

    /** Size ratio at which a line is a level-2 heading on size alone. */
    private static final float H2_RATIO = 1.3f;

    /**
     * Prototype ablation switch: when false the shipped size-only rules apply, so the combined
     * build can be measured with heading detection alone removed.
     */
    private static final boolean ENABLED =
            Boolean.parseBoolean(System.getProperty("stirling.md.headings", "true"));

    /** Ablation switch for the run-on-sentence guard. */
    private static final boolean RUN_ON_GUARD =
            Boolean.parseBoolean(System.getProperty("stirling.md.runOnGuard", "true"));

    /** Ablation switch for extending the run-on guard to bold emphasis. */
    private static final boolean RUN_ON_BOLD =
            Boolean.parseBoolean(System.getProperty("stirling.md.runOnBold", "true"));

    /** Ablation switch: promote an isolated, all-capitals, numbered clause. */
    private static final boolean ALL_CAPS_HEADINGS =
            Boolean.parseBoolean(System.getProperty("stirling.md.allCaps", "true"));

    /**
     * A section number that ends in a period: {@code 3.}, {@code 7.2.}. Stricter than {@link
     * #CLAUSE} on purpose — the rule it guards has no typography behind it, so the leading page
     * number of a running header ({@code 68 APPLIED FLUID MECHANICS LAB MANUAL}) has to be told
     * apart from a real clause by the period alone.
     */
    private static final Pattern NUMBERED_CLAUSE =
            Pattern.compile("^\\d{1,2}(\\.\\d{1,2})*\\.\\s+\\p{Lu}");

    /**
     * True when every cased letter on the line is a capital and the line is really made of words.
     * Digits, punctuation and uncased scripts do not count either way, so {@code BIO 181} and
     * {@code 3. RECOLLECTION OF NATIONAL INITIATIVES} both qualify.
     */
    private static boolean isAllCaps(String text) {
        int upper = 0;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (Character.isLowerCase(c)) {
                return false;
            }
            if (Character.isUpperCase(c)) {
                upper++;
            }
        }
        return upper >= 2;
    }

    /**
     * Returns the Markdown heading prefix for a line. The decision combines several signals, never
     * text matching, so a plain line that merely shares text with a heading is never promoted:
     *
     * <ul>
     *   <li><b>Size</b> — dominant glyph font size vs. the document body median (primary signal).
     *       Some PDFs encode visual size in the text matrix, so every glyph reports ~1.0; for those
     *       {@link #glyphHeight} measures the line from its glyph boxes instead.
     *   <li><b>Brevity</b> — headings are short labels; a line over {@value #MAX_HEADING_WORDS}
     *       words is body text regardless of size.
     *   <li><b>Not a sentence</b> — a line ending in {@code . ! ?} reads as prose, not a heading.
     *   <li><b>Words</b> — a heading names something, so it is made of letters; a float caption
     *       names an illustration, not a section, so it is never promoted however it is set.
     * </ul>
     *
     * <p>Boldness is deliberately <em>not</em> a heading signal — a bold-but-not-larger line is
     * emphasis, not a heading (see {@link #isBoldLabel}); promoting it to {@code #}/{@code ##} is
     * the main source of false-positive headings.
     *
     * <ul>
     *   <li>size &gt; baseline * 1.4 → {@code "# "}
     *   <li>size &gt; baseline * 1.2 → {@code "## "}
     *   <li>otherwise → {@code ""}
     * </ul>
     */
    static String headingPrefix(
            TextLine line,
            float medianBodySize,
            float medianBodyHeight,
            String bodyFont,
            boolean isolated) {
        return headingPrefix(
                line.text(),
                line.height(),
                line.words(),
                medianBodySize,
                medianBodyHeight,
                bodyFont,
                isolated);
    }

    /**
     * Geometry-only overload so a line assembled from several extractor fragments can be judged on
     * its merged text, height and words rather than on whichever fragment happened to come first.
     *
     * @param bodyFont the document's dominant (body) font, so boldness only counts when it differs
     * @param isolated true when the line starts its own block, i.e. a blank gap precedes it
     */
    static String headingPrefix(
            String lineText,
            float lineHeight,
            List<TextWord> words,
            float medianBodySize,
            float medianBodyHeight,
            String bodyFont,
            boolean isolated) {
        String text = lineText.strip();
        if (text.isEmpty() || wordCount(text) > MAX_HEADING_WORDS) {
            return "";
        }
        if (!ENABLED && endsLikeSentence(text)) {
            return "";
        }

        float ratio = sizeRatio(lineHeight, words, medianBodySize, medianBodyHeight);
        if (ratio < 0f) {
            return "";
        }
        if (!ENABLED) {
            return ratio > 1.4f ? "# " : ratio > 1.2f ? "## " : "";
        }
        // A heading names something. A line with no word in it is a value, an equation fragment or
        // a chart label, however large it is set; a caption names a float, not a section.
        if (CAPTION.matcher(text).find() || !hasWord(text)) {
            return "";
        }
        if (RUN_ON_GUARD && RUNS_ON.matcher(text).find()) {
            return "";
        }

        // Bold only marks a heading when it stands out from the body face. Some documents set
        // the whole body in a bold-named font, where boldness carries no structural meaning.
        boolean bold = isBold(words) && !normalisedFont(words).equals(normalise(bodyFont));
        // A line that reads as a sentence is prose, unless it carries heading typography.
        if (endsLikeSentence(text) && !bold && ratio <= H2_RATIO) {
            return "";
        }

        if (ratio > H1_RATIO) {
            return "# ";
        }
        if (ratio > H2_RATIO) {
            return "## ";
        }
        // A numbered clause: the section number is the structure, so it needs no blank line above
        // it to be one. Requiring a capital after the number keeps ordinary list items out.
        if (bold && CLAUSE.matcher(text).find()) {
            return "### ";
        }
        // Same size as the body but bold and starting its own block: a run-in section heading.
        if (bold && isolated && hasWord(text)) {
            return "### ";
        }
        // Some documents give a heading no size and no weight, only capitals. A short, isolated
        // line set entirely in capitals is one of those.
        if (ALL_CAPS_HEADINGS
                && isolated
                && !endsLikeSentence(text)
                && wordCount(text) >= 3
                && isAllCaps(text)
                && NUMBERED_CLAUSE.matcher(text).find()) {
            return "### ";
        }
        return "";
    }

    private static float sizeRatio(
            float lineHeight, List<TextWord> words, float medianBodySize, float medianBodyHeight) {
        float dominant = dominantFontSize(words);
        float value;
        float baseline;
        if (dominant > 2f && medianBodySize > 2f) {
            value = dominant;
            baseline = medianBodySize;
        } else {
            float glyph = glyphHeight(words);
            value = glyph > 0f ? glyph : lineHeight;
            baseline = medianBodyHeight;
        }
        return baseline <= 0f ? -1f : value / baseline;
    }

    /**
     * Quantile of a line's glyph heights taken as its size. In Latin text roughly a quarter to a
     * third of the glyphs reach cap or ascender height, so the upper quintile lands on that band:
     * high enough to measure the face rather than the x-height, low enough that one rogue glyph box
     * — a symbol or a control code borrowed from another font — cannot set the line's size.
     */
    private static final float GLYPH_HEIGHT_QUANTILE = 0.8f;

    /**
     * A line's type size, measured from its glyphs. Used when the PDF encodes visual size in the
     * text matrix, so every glyph reports the same nominal font size and only geometry is left.
     *
     * <p>The line's own bounding box cannot serve here. It spans the tallest ascender down to the
     * deepest descender, so an otherwise identical line grows by a quarter as soon as it happens to
     * contain a {@code g} or a comma — enough on its own to clear the heading ratio. A quantile of
     * the glyph boxes sits on the cap/ascender band instead, which is the same on every line set in
     * the same face and scales with a face that really is larger.
     */
    private static float glyphHeight(List<TextWord> words) {
        int capacity = 0;
        for (TextWord word : words) {
            capacity += word.chars().size();
        }
        if (capacity == 0) {
            return 0f;
        }
        float[] heights = new float[capacity];
        int n = 0;
        for (TextWord word : words) {
            for (TextChar ch : word.chars()) {
                if (ch.isWhitespace() || ch.isNewline()) {
                    continue;
                }
                // Letters and digits only. A bracket, a slash or a maths operator is drawn taller
                // than the cap height on purpose, so a line of them — an equation, an equation
                // number — would measure as display type set in the body face.
                if (!Character.isLetterOrDigit(ch.toChar())) {
                    continue;
                }
                float h = ch.height();
                if (Float.isFinite(h) && h > 0f) {
                    heights[n++] = h;
                }
            }
        }
        if (n == 0) {
            return 0f;
        }
        Arrays.sort(heights, 0, n);
        return heights[(int) (GLYPH_HEIGHT_QUANTILE * (n - 1))];
    }

    private static String normalise(String fontName) {
        return SUBSET_TAG.matcher(fontName == null ? "" : fontName).replaceFirst("");
    }

    private static String normalisedFont(List<TextWord> words) {
        return normalise(dominantFontName(words));
    }

    /** Most-used font across the document, weighted by glyph count: the body face. */
    static String bodyFont(List<PageText> allPages) {
        Map<String, Integer> counts = new HashMap<>();
        for (PageText page : allPages) {
            for (TextChar ch : page.chars()) {
                if (ch.isWhitespace() || ch.isNewline()) {
                    continue;
                }
                String name = ch.fontName();
                if (name != null && !name.isBlank()) {
                    counts.merge(normalise(name), 1, Integer::sum);
                }
            }
        }
        String dominant = "";
        int max = -1;
        for (Map.Entry<String, Integer> e : counts.entrySet()) {
            if (e.getValue() > max) {
                max = e.getValue();
                dominant = e.getKey();
            }
        }
        return dominant;
    }

    /**
     * A heading names something, so it is made of words: at least two letters, and letters are at
     * least half of what is on the line.
     *
     * <p>Counting letters rather than looking for a run of them keeps letter-spaced display type
     * ({@code H O W C A N Y O U H E L P ?}) eligible, while the majority test still rejects the
     * lines that carry heading typography without being headings — equation fragments, equation
     * numbers, and the value labels scattered over a chart.
     */
    private static boolean hasWord(String text) {
        int letters = 0;
        int glyphs = 0;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (Character.isWhitespace(c)) {
                continue;
            }
            glyphs++;
            if (Character.isLetter(c)) {
                letters++;
            }
        }
        return letters >= 2 && letters * 2 >= glyphs;
    }

    /**
     * True when a line should be emphasised as bold (rendered {@code **like this**}) rather than
     * promoted to a heading: it is bold, short, and not a full sentence. Used for bold labels that
     * are not large enough to be headings.
     */
    static boolean isBoldLabel(TextLine line) {
        return isBoldLabel(line.text(), line.words());
    }

    /** Geometry-only overload; see {@link #headingPrefix(String, float, List, float, float)}. */
    static boolean isBoldLabel(String lineText, List<TextWord> words) {
        String text = lineText.strip();
        if (text.isEmpty() || wordCount(text) > MAX_HEADING_WORDS || endsLikeSentence(text)) {
            return false;
        }
        if (RUN_ON_BOLD && RUNS_ON.matcher(text).find()) {
            return false;
        }
        return hasWord(text) && isBold(words);
    }

    private static int wordCount(String text) {
        return text.split("\\s+").length;
    }

    private static boolean endsLikeSentence(String text) {
        char last = text.charAt(text.length() - 1);
        return last == '.' || last == '!' || last == '?';
    }

    /** True when the line's dominant font is bold, inferred from PostScript font names. */
    private static boolean isBold(List<TextWord> words) {
        String lower = normalisedFont(words).toLowerCase(Locale.ROOT);
        for (String token : BOLD_TOKENS) {
            if (lower.contains(token)) {
                return true;
            }
        }
        return OTHER_BOLD.matcher(lower).find();
    }

    private static String dominantFontName(List<TextWord> words) {
        Map<String, Integer> counts = new HashMap<>();
        for (TextWord word : words) {
            for (TextChar ch : word.chars()) {
                if (ch.isWhitespace() || ch.isNewline()) {
                    continue;
                }
                String name = ch.fontName();
                if (name != null && !name.isBlank()) {
                    counts.merge(name, 1, Integer::sum);
                }
            }
        }
        String dominantFont = "";
        int max = -1;
        for (Map.Entry<String, Integer> e : counts.entrySet()) {
            if (e.getValue() > max) {
                max = e.getValue();
                dominantFont = e.getKey();
            }
        }
        return dominantFont;
    }

    /** Computes the median glyph font size across all pages. */
    static float medianFontSize(List<PageText> allPages) {
        List<Float> sizes = new ArrayList<>();
        for (PageText page : allPages) {
            for (TextChar ch : page.chars()) {
                if (!ch.isWhitespace() && !ch.isNewline() && ch.fontSize() > 0f) {
                    sizes.add(ch.fontSize());
                }
            }
        }
        return median(sizes, 12f);
    }

    /**
     * The body baseline the height path compares a line against: the median of the per-line glyph
     * height, weighted by how much text each line carries. Measured exactly as {@link #glyphHeight}
     * measures a line, so the two are commensurable.
     *
     * <p>Weighting by characters rather than by lines matters on a page of charts. A chart
     * contributes dozens of two-character axis labels set in the smallest type on the page; an
     * unweighted median follows them rather than the prose, and every body line then reads as
     * display type. Weighting the same way {@link #medianFontSize} does keeps the baseline on the
     * text the document is mostly made of.
     */
    static float medianLineHeight(List<PageText> allPages) {
        List<float[]> weighted = new ArrayList<>();
        double total = 0;
        for (PageText page : allPages) {
            for (TextLine line : page.lines()) {
                if (line.text().isBlank()) {
                    continue;
                }
                float h = glyphHeight(line.words());
                if (h <= 0f) {
                    h = line.height();
                }
                if (h <= 0f) {
                    continue;
                }
                float w = glyphCount(line);
                weighted.add(new float[] {h, w});
                total += w;
            }
        }
        if (weighted.isEmpty()) {
            return 12f;
        }
        weighted.sort(Comparator.comparingDouble(p -> p[0]));
        double half = total / 2d;
        double seen = 0;
        for (float[] p : weighted) {
            seen += p[1];
            if (seen >= half) {
                return p[0];
            }
        }
        return weighted.get(weighted.size() - 1)[0];
    }

    /** How much text a line carries, in glyphs; at least one so an empty line still counts. */
    private static float glyphCount(TextLine line) {
        int glyphs = 0;
        for (TextWord word : line.words()) {
            for (TextChar ch : word.chars()) {
                if (!ch.isWhitespace() && !ch.isNewline()) {
                    glyphs++;
                }
            }
        }
        return Math.max(1, glyphs);
    }

    private static float median(List<Float> values, float fallback) {
        if (values.isEmpty()) {
            return fallback;
        }
        Collections.sort(values);
        int mid = values.size() / 2;
        if (values.size() % 2 == 0) {
            return (values.get(mid - 1) + values.get(mid)) / 2f;
        }
        return values.get(mid);
    }

    /**
     * Returns the font size that appears most often (by character count) in the given line. Ties
     * are broken in favour of the larger size.
     */
    private static float dominantFontSize(List<TextWord> words) {
        Map<Float, Integer> counts = new HashMap<>();
        for (TextWord word : words) {
            for (TextChar ch : word.chars()) {
                if (!ch.isWhitespace() && !ch.isNewline() && ch.fontSize() > 0f) {
                    counts.merge(ch.fontSize(), 1, Integer::sum);
                }
            }
        }
        if (counts.isEmpty()) {
            return 0f;
        }
        float dominant = 0f;
        int maxCount = -1;
        for (Map.Entry<Float, Integer> entry : counts.entrySet()) {
            int count = entry.getValue();
            float size = entry.getKey();
            if (count > maxCount || (count == maxCount && size > dominant)) {
                maxCount = count;
                dominant = size;
            }
        }
        return dominant;
    }
}
