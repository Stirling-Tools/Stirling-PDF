package stirling.software.common.pdf.ua;

import java.util.List;

/**
 * A run of text on one baseline, with the operator ordinals that produced it. {@code preMarked}
 * means the source stream already wrapped this text in BDC/EMC.
 */
public record TextLineInfo(
        int pageIndex,
        String text,
        BBox bbox,
        float dominantFontSize,
        boolean bold,
        int startOrdinal,
        int endOrdinal,
        boolean preMarked,
        List<WordInfo> words) {

    public boolean isBlank() {
        return text == null || text.isBlank();
    }

    public int charCount() {
        return text == null ? 0 : text.strip().length();
    }

    public int wordCount() {
        return (int) words.stream().filter(w -> !w.isBlank()).count();
    }

    /** True when every word occupies its own operator run, so cells can be tagged separately. */
    public boolean wordsAreSeparable() {
        List<WordInfo> real = words.stream().filter(w -> !w.isBlank()).toList();
        for (int i = 1; i < real.size(); i++) {
            if (!real.get(i - 1).isSeparableFrom(real.get(i))) {
                return false;
            }
        }
        return true;
    }
}
