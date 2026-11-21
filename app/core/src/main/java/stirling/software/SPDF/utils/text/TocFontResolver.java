package stirling.software.SPDF.utils.text;

import java.io.IOException;
import java.io.InputStream;
import java.text.Bidi;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.springframework.core.io.ClassPathResource;

public class TocFontResolver {
    private static final String FONT_DEFAULT = "static/fonts/NotoSans-Regular.ttf";
    private static final String FONT_CJK = "static/fonts/NotoSansSC-Regular.ttf";
    private static final String FONT_KOREAN = "static/fonts/NotoSansKR-Regular.ttf";
    private static final String FONT_THAI = "static/fonts/NotoSansThai-Regular.ttf";
    private static final String FONT_HEBREW = "static/fonts/NotoSansHebrew-Regular.ttf";
    private static final String FONT_ARABIC = "static/fonts/NotoSansArabic-Regular.ttf";
    private static final String ELLIPSIS = "…";
    private static final String BRACKETS = "()[]{}<>«»";
    private static final String MIRRORED_BRACKETS = ")(][}{><»«";
    private static final Pattern GRAPHEME = Pattern.compile("\\X");

    public record TextRun(PDFont font, String text) {}

    private final PDDocument document;
    private final Map<String, PDFont> loadedFonts = new HashMap<>();

    public TocFontResolver(PDDocument document) {
        this.document = document;
    }

    public PDFont primaryFont() throws IOException {
        return load(FONT_DEFAULT);
    }

    /**
     * Splits {@code text} into single-font runs in visual order (right-to-left passages reversed),
     * ready to draw left to right as-is. Characters no bundled font covers become {@code ?}. The
     * fonts are loaded into the constructor's document, so draw the runs only there.
     */
    public List<TextRun> toRuns(String text) throws IOException {
        List<TextRun> runs = new ArrayList<>();
        if (text == null || text.isEmpty()) {
            return runs;
        }
        text = toVisualOrder(text);
        StringBuilder buffer = new StringBuilder();
        PDFont current = null;
        for (int i = 0; i < text.length(); ) {
            int codePoint = text.codePointAt(i);
            i += Character.charCount(codePoint);

            PDFont font = fontFor(codePoint, current);
            String character = font == null ? "?" : Character.toString(codePoint);
            if (font == null) {
                font = primaryFont();
            }
            if (font != current && !buffer.isEmpty()) {
                runs.add(new TextRun(current, buffer.toString()));
                buffer.setLength(0);
            }
            current = font;
            buffer.append(character);
        }
        if (!buffer.isEmpty()) {
            runs.add(new TextRun(current, buffer.toString()));
        }
        return runs;
    }

    /**
     * Like {@link #toRuns}, but cut short with a trailing "…" until the runs fit {@code maxWidth}.
     * If even "…" alone is too wide, it is returned anyway.
     */
    public List<TextRun> fitToWidth(String text, float fontSize, float maxWidth)
        throws IOException {
        List<TextRun> runs = toRuns(text);
        if (width(runs, fontSize) <= maxWidth) {
            return runs;
        }
        int end = text.length();
        while (end > 0) {
            end = text.offsetByCodePoints(end, -1);
            runs = toRuns(text.substring(0, end).stripTrailing() + ELLIPSIS);
            if (width(runs, fontSize) <= maxWidth) {
                return runs;
            }
        }
        return toRuns(ELLIPSIS);
    }

    public static float width(List<TextRun> runs, float fontSize) throws IOException {
        float width = 0;
        for (TextRun run : runs) {
            width += run.font().getStringWidth(run.text()) / 1000f * fontSize;
        }
        return width;
    }

    static String toVisualOrder(String text) {
        Bidi bidi = new Bidi(text, Bidi.DIRECTION_DEFAULT_LEFT_TO_RIGHT);
        if (bidi.isLeftToRight()) {
            return text;
        }
        int runCount = bidi.getRunCount();
        byte[] levels = new byte[runCount];
        Integer[] runs = new Integer[runCount];
        for (int i = 0; i < runCount; i++) {
            levels[i] = (byte) bidi.getRunLevel(i);
            runs[i] = i;
        }
        Bidi.reorderVisually(levels, 0, runs, 0, runCount);

        StringBuilder visual = new StringBuilder();
        for (int run : runs) {
            String part = text.substring(bidi.getRunStart(run), bidi.getRunLimit(run));
            visual.append(bidi.getRunLevel(run) % 2 == 1 ? reverse(part) : part);
        }
        return visual.toString();
    }

    private static String reverse(String text) {
        List<String> graphemes = new ArrayList<>();
        GRAPHEME.matcher(text).results().forEach(match -> graphemes.addFirst(match.group()));
        StringBuilder reversed = new StringBuilder();
        for (String grapheme : graphemes) {
            int bracket = grapheme.length() == 1 ? BRACKETS.indexOf(grapheme) : -1;
            reversed.append(bracket >= 0 ? MIRRORED_BRACKETS.charAt(bracket) : grapheme);
        }
        return reversed.toString();
    }

    private PDFont fontFor(int codePoint, PDFont current) throws IOException {
        String character = Character.toString(codePoint);
        Character.UnicodeScript script = Character.UnicodeScript.of(codePoint);
        boolean neutral =
            script == Character.UnicodeScript.COMMON
                || script == Character.UnicodeScript.INHERITED;
        if (neutral && TextEncodingHelper.canEncodeCharacters(current, character)) {
            return current;
        }
        PDFont candidate = load(pathFor(codePoint, script));
        if (TextEncodingHelper.canEncodeCharacters(candidate, character)) {
            return candidate;
        }
        PDFont primary = primaryFont();
        return TextEncodingHelper.canEncodeCharacters(primary, character) ? primary : null;
    }

    private PDFont load(String path) throws IOException {
        PDFont font = loadedFonts.get(path);
        if (font == null) {
            try (InputStream fontStream = new ClassPathResource(path).getInputStream()) {
                font = PDType0Font.load(document, fontStream);
            }
            loadedFonts.put(path, font);
        }
        return font;
    }

    private static String pathFor(int codePoint, Character.UnicodeScript script) {
        if (isCjkPunctuation(codePoint)) {
            return FONT_CJK;
        }
        return switch (script) {
            case HAN, HIRAGANA, KATAKANA -> FONT_CJK;
            case HANGUL -> FONT_KOREAN;
            case THAI -> FONT_THAI;
            case HEBREW -> FONT_HEBREW;
            case ARABIC -> FONT_ARABIC;
            default -> FONT_DEFAULT;
        };
    }

    private static boolean isCjkPunctuation(int codePoint) {
        Character.UnicodeBlock block = Character.UnicodeBlock.of(codePoint);
        return block == Character.UnicodeBlock.CJK_SYMBOLS_AND_PUNCTUATION
            || block == Character.UnicodeBlock.HALFWIDTH_AND_FULLWIDTH_FORMS;
    }
}
