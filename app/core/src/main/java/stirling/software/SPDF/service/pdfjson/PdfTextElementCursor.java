package stirling.software.SPDF.service.pdfjson;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Objects;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.model.json.PdfJsonTextElement;

@Slf4j
public final class PdfTextElementCursor {
    private final List<PdfJsonTextElement> elements;
    private int index = 0;

    public PdfTextElementCursor(List<PdfJsonTextElement> elements) {
        this.elements = elements;
    }

    public int remaining() {
        return Math.max(0, elements.size() - index);
    }

    public boolean hasRemaining() {
        return index < elements.size();
    }

    public int getIndex() {
        return index;
    }

    public List<PdfJsonTextElement> consume(String expectedFontName, int glyphCount) {
        if (glyphCount <= 0) {
            return Collections.emptyList();
        }
        List<PdfJsonTextElement> consumed = new ArrayList<>();
        int remaining = glyphCount;
        while (remaining > 0 && index < elements.size()) {
            PdfJsonTextElement element = elements.get(index);
            if (!fontMatches(expectedFontName, element.getFontId())) {
                log.debug(
                        "Cursor consume failed: font mismatch (expected={}, actual={}) at element {}",
                        expectedFontName,
                        element.getFontId(),
                        index);
                return null;
            }
            consumed.add(element);
            remaining -= countGlyphs(element);
            index++;
        }
        if (remaining > 0) {
            log.debug(
                    "Cursor consume failed: ran out of elements (remaining={}, currentIndex={}, total={})",
                    remaining,
                    index,
                    elements.size());
            return null;
        }
        return consumed;
    }

    private boolean fontMatches(String expected, String actual) {
        if (expected == null || expected.isEmpty()) {
            return true;
        }
        if (actual == null) {
            return false;
        }
        return Objects.equals(expected, actual);
    }

    private int countGlyphs(PdfJsonTextElement element) {
        int[] codes = element.getCharCodes();
        if (codes != null && codes.length > 0) {
            return codes.length;
        }
        String text = element.getText();
        if (text != null && !text.isEmpty()) {
            return Math.max(1, text.codePointCount(0, text.length()));
        }
        return 1;
    }
}
