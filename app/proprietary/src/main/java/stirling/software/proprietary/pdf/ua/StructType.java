package stirling.software.proprietary.pdf.ua;

/**
 * PDF standard structure types emitted by the tagger (ISO 32000-1 14.8.4), limited to the PDF/UA
 * subset. {@link #ARTIFACT} is not one: it marks content in the stream and stays out of the tree.
 */
public enum StructType {
    DOCUMENT("Document"),
    PART("Part"),
    SECT("Sect"),
    H1("H1"),
    H2("H2"),
    H3("H3"),
    H4("H4"),
    H5("H5"),
    H6("H6"),
    P("P"),
    L("L"),
    LI("LI"),
    LBL("Lbl"),
    LBODY("LBody"),
    TABLE("Table"),
    TR("TR"),
    TH("TH"),
    TD("TD"),
    FIGURE("Figure"),
    CAPTION("Caption"),
    FORMULA("Formula"),
    NOTE("Note"),
    FENOTE("FENote"),
    LINK("Link"),
    /** Wraps a widget annotation; PDF/UA-1 clause 7.18.4 requires widgets to sit inside one. */
    FORM("Form"),
    SPAN("Span"),
    ARTIFACT("Artifact");

    private final String tag;

    StructType(String tag) {
        this.tag = tag;
    }

    /** The name written into the PDF {@code /S} entry. */
    public String tag() {
        return tag;
    }

    public boolean isHeading() {
        return this == H1 || this == H2 || this == H3 || this == H4 || this == H5 || this == H6;
    }

    /** Heading level 1-6, or 0 when this is not a heading. */
    public int headingLevel() {
        return isHeading() ? ordinal() - H1.ordinal() + 1 : 0;
    }

    /** The heading type for a 1-based level, clamped to the H1-H6 range. */
    public static StructType heading(int level) {
        int clamped = Math.max(1, Math.min(6, level));
        return values()[H1.ordinal() + clamped - 1];
    }
}
