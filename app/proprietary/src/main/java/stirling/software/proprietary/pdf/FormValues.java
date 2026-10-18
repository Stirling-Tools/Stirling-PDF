package stirling.software.proprietary.pdf;

import java.util.ArrayList;
import java.util.List;

import stirling.software.jpdfium.PdfDocument;
import stirling.software.jpdfium.PdfPage;
import stirling.software.jpdfium.doc.FormField;
import stirling.software.jpdfium.doc.FormFieldType;
import stirling.software.jpdfium.doc.PdfFormReader;
import stirling.software.jpdfium.model.Rect;
import stirling.software.jpdfium.text.TextChar;
import stirling.software.jpdfium.text.TextLine;
import stirling.software.jpdfium.text.TextWord;

/**
 * Recovers AcroForm values that live only in a field's {@code /V}, as pseudo lines at their widget
 * rectangles so they land in reading order.
 */
final class FormValues {

    private FormValues() {}

    /**
     * Pseudo text lines for {@code /V}-only AcroForm values, placed at their widget rectangles;
     * values already in the content stream are skipped.
     */
    static List<Line> lines(PdfDocument doc, int pageIndex, List<Line> existing) {
        List<FormField> fields;
        try (PdfPage page = doc.page(pageIndex)) {
            fields = PdfFormReader.readPage(page.rawDocHandle(), page.rawHandle(), pageIndex);
        } catch (RuntimeException e) {
            // A malformed AcroForm must not sink the whole conversion; body text still stands.
            return List.of();
        }
        List<Line> out = new ArrayList<>();
        for (FormField f : fields) {
            String value = fieldText(f);
            if (value == null || value.isBlank()) {
                continue;
            }
            Rect r = f.rect();
            if (r == null || r.width() <= 0 || r.height() <= 0) {
                continue;
            }
            if (alreadyInContent(existing, value, r)) {
                continue;
            }
            out.add(syntheticLine(value, r));
        }
        return out;
    }

    /** The text a filled field contributes, or null when the field contributes nothing. */
    private static String fieldText(FormField f) {
        FormFieldType type = f.type();
        if (type == FormFieldType.PUSHBUTTON
                || type == FormFieldType.SIGNATURE
                || type == FormFieldType.UNKNOWN) {
            return null;
        }
        if (type == FormFieldType.CHECKBOX || type == FormFieldType.RADIO) {
            return f.checked() ? "[x]" : null;
        }
        String value = f.value();
        if (value == null || "Off".equals(value)) {
            return null;
        }
        return value.replace('\r', ' ').replace('\n', ' ').strip();
    }

    /** True when the extractor already found this value inside the widget's own rectangle. */
    private static boolean alreadyInContent(List<Line> lines, String value, Rect r) {
        String needle = MarkdownText.normaliseSpace(value);
        for (Line l : lines) {
            boolean overlaps =
                    l.x < r.x() + r.width()
                            && l.x + l.width > r.x()
                            && l.y < r.y() + r.height()
                            && l.y + l.height > r.y();
            if (overlaps && MarkdownText.normaliseSpace(l.text).contains(needle)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Wraps a field value as a one-word-per-token {@link TextLine} at the widget rectangle, so
     * downstream stages treat it like any other text.
     */
    private static Line syntheticLine(String value, Rect r) {
        String[] tokens = value.split("\\s+");
        float height = Math.min(r.height(), 14f);
        float advance = tokens.length == 0 ? r.width() : r.width() / tokens.length;
        List<TextWord> words = new ArrayList<>(tokens.length);
        for (int i = 0; i < tokens.length; i++) {
            float wx = r.x() + advance * i;
            List<TextChar> chars = new ArrayList<>(tokens[i].length());
            float charWidth = tokens[i].isEmpty() ? advance : advance / tokens[i].length();
            for (int c = 0; c < tokens[i].length(); c++) {
                chars.add(
                        new TextChar(
                                c,
                                tokens[i].charAt(c),
                                wx + charWidth * c,
                                r.y(),
                                charWidth,
                                height,
                                "",
                                0f));
            }
            words.add(new TextWord(chars, wx, r.y(), advance * 0.95f, height));
        }
        TextLine line = new TextLine(words, r.x(), r.y(), r.width(), height);
        Line out = new Line(line, value);
        out.synthetic = true;
        return out;
    }
}
