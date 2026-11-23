package stirling.software.SPDF.service.ocr;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.contentstream.operator.Operator;
import org.apache.pdfbox.cos.COSArray;
import org.apache.pdfbox.cos.COSFloat;
import org.apache.pdfbox.cos.COSName;
import org.apache.pdfbox.cos.COSNumber;
import org.apache.pdfbox.cos.COSString;
import org.apache.pdfbox.pdfparser.PDFStreamParser;
import org.apache.pdfbox.pdfwriter.ContentStreamWriter;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDStream;

/**
 * Removes the spaces Tesseract puts between Chinese and Japanese words. Those scripts write no
 * spaces, but Tesseract separates every word it finds with one: the best models split most
 * characters ("本 季度 的"), as do any models when a Latin language is listed first, so copied and
 * searched text came out broken. Spaces next to Latin text, Korean or anything else are kept.
 */
final class CjkSpacing {

    private CjkSpacing() {}

    /** Chinese and Japanese characters, including their full-width punctuation. */
    static boolean isCjk(int codePoint) {
        Character.UnicodeScript script = Character.UnicodeScript.of(codePoint);
        if (script == Character.UnicodeScript.HAN
                || script == Character.UnicodeScript.HIRAGANA
                || script == Character.UnicodeScript.KATAKANA
                || script == Character.UnicodeScript.BOPOMOFO) {
            return true;
        }
        return (codePoint >= 0x3000 && codePoint <= 0x303F)
                || (codePoint >= 0xFF00 && codePoint <= 0xFFEF)
                || (codePoint >= 0xFE30 && codePoint <= 0xFE4F)
                || (codePoint >= 0xFE10 && codePoint <= 0xFE1F);
    }

    static boolean containsCjk(String text) {
        return text.codePoints().anyMatch(CjkSpacing::isCjk);
    }

    /** {@code text} without the spaces between two CJK characters on the same line. */
    static String join(String text) {
        if (!containsCjk(text)) return text;
        StringBuilder out = new StringBuilder(text.length());
        int i = 0;
        while (i < text.length()) {
            int end = i;
            while (end < text.length() && text.charAt(end) == ' ') end++;
            if (end > i) {
                boolean between =
                        out.length() > 0
                                && end < text.length()
                                && isCjk(out.codePointBefore(out.length()))
                                && isCjk(text.codePointAt(end));
                if (!between) out.append(text, i, end);
                i = end;
            } else {
                int cp = text.codePointAt(i);
                out.appendCodePoint(cp);
                i += Character.charCount(cp);
            }
        }
        return out.toString();
    }

    /**
     * Applies {@link #join} to the text-only page TessPDFRenderer writes. Each word there is one
     * {@code [<UTF-16BE>] TJ} after its own {@code Tz}, ending in a space when another word
     * follows. The space is dropped when it sits between CJK characters, and {@code Tz} widened so
     * the word still covers its box. Anything else in the stream is left alone.
     */
    static void joinTextLayer(PDDocument textLayer) throws IOException {
        PDPage page = textLayer.getPage(0);
        List<Object> tokens;
        try (var contents = page.getContents()) {
            tokens = new PDFStreamParser(contents.readAllBytes()).parse();
        }
        List<Integer> words = new ArrayList<>();
        for (int i = 1; i < tokens.size(); i++) {
            if (tokens.get(i) instanceof Operator op
                    && "TJ".equals(op.getName())
                    && tokens.get(i - 1) instanceof COSArray array
                    && array.size() == 1
                    && array.get(0) instanceof COSString) {
                words.add(i - 1);
            }
        }
        boolean changed = false;
        for (int w = 0; w + 1 < words.size(); w++) {
            COSArray array = (COSArray) tokens.get(words.get(w));
            String word = text((COSString) array.get(0));
            String next = text((COSString) ((COSArray) tokens.get(words.get(w + 1))).get(0));
            int glyphs = word.length();
            if (glyphs < 2
                    || word.charAt(glyphs - 1) != ' '
                    || next.isEmpty()
                    || !isCjk(word.codePointBefore(glyphs - 1))
                    || !isCjk(next.codePointAt(0))) {
                continue;
            }
            COSString joined =
                    new COSString(
                            word.substring(0, glyphs - 1).getBytes(StandardCharsets.UTF_16BE));
            joined.setForceHexForm(true);
            array.set(0, joined);
            widen(tokens, words.get(w), glyphs);
            changed = true;
        }
        if (!changed) return;
        PDStream rewritten = new PDStream(textLayer);
        try (OutputStream out = rewritten.createOutputStream(COSName.FLATE_DECODE)) {
            new ContentStreamWriter(out).writeTokens(tokens);
        }
        page.setContents(rewritten);
    }

    private static String text(COSString string) {
        return new String(string.getBytes(), StandardCharsets.UTF_16BE);
    }

    /** Scales the word's preceding {@code Tz} by glyphs / (glyphs - 1); every glyph is as wide. */
    private static void widen(List<Object> tokens, int arrayIndex, int glyphs) {
        for (int i = arrayIndex - 1; i > 0; i--) {
            Object token = tokens.get(i);
            if (token instanceof Operator op) {
                if ("Tz".equals(op.getName()) && tokens.get(i - 1) instanceof COSNumber tz) {
                    tokens.set(i - 1, new COSFloat(tz.floatValue() * glyphs / (glyphs - 1)));
                }
                if ("Tz".equals(op.getName()) || "TJ".equals(op.getName())) return;
            }
        }
    }
}
