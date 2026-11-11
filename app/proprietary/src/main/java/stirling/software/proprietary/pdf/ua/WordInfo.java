package stirling.software.proprietary.pdf.ua;

/**
 * A whitespace-delimited run of glyphs, with the operator ordinals that produced it. Cell detection
 * needs both: geometry to find cells, ordinals to tell whether they can be tagged separately.
 */
public record WordInfo(
        String text, BBox bbox, int startOrdinal, int endOrdinal, float fontSize, boolean bold) {

    public boolean isBlank() {
        return text == null || text.isBlank();
    }

    /** True when this word shares no operator with the other, so both can carry their own MCID. */
    public boolean isSeparableFrom(WordInfo other) {
        return endOrdinal < other.startOrdinal || other.endOrdinal < startOrdinal;
    }
}
