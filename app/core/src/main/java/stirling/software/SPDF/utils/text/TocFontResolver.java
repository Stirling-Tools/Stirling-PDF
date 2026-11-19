package stirling.software.SPDF.utils.text;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

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

    public record TextRun(PDFont font, String text) {}

    private final PDDocument document;
    private final Map<String, PDFont> loadedFonts = new HashMap<>();

    public TocFontResolver(PDDocument document) {
        this.document = document;
    }

    public PDFont primaryFont() throws IOException {
        return load(FONT_DEFAULT);
    }

    public List<TextRun> toRuns(String text) throws IOException {
        List<TextRun> runs = new ArrayList<>();
        if (text == null || text.isEmpty()) {
            return runs;
        }
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

    private PDFont fontFor(int codePoint, PDFont current) throws IOException {
        String character = Character.toString(codePoint);
        Character.UnicodeScript script = Character.UnicodeScript.of(codePoint);
        boolean neutral =
                script == Character.UnicodeScript.COMMON
                        || script == Character.UnicodeScript.INHERITED;
        if (neutral
                && current != null
                && TextEncodingHelper.canEncodeCharacters(current, character)) {
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
        return switch (script) {
            case HAN, HIRAGANA, KATAKANA -> FONT_CJK;
            case HANGUL -> FONT_KOREAN;
            case THAI -> FONT_THAI;
            case HEBREW -> FONT_HEBREW;
            case ARABIC -> FONT_ARABIC;
            case COMMON -> isCjkPunctuation(codePoint) ? FONT_CJK : FONT_DEFAULT;
            default -> FONT_DEFAULT;
        };
    }

    private static boolean isCjkPunctuation(int codePoint) {
        Character.UnicodeBlock block = Character.UnicodeBlock.of(codePoint);
        return block == Character.UnicodeBlock.CJK_SYMBOLS_AND_PUNCTUATION
                || block == Character.UnicodeBlock.HALFWIDTH_AND_FULLWIDTH_FORMS;
    }
}
