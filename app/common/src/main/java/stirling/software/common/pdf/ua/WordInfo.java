package stirling.software.common.pdf.ua;

/**
 * A whitespace-delimited run of glyphs, with the operator ordinals that produced it.
 *
 * <p>Cell detection needs word geometry, and cells can only become separate structure elements when
 * their words come from different operators, so both are carried here.
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
