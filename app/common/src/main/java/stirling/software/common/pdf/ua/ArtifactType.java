package stirling.software.common.pdf.ua;

/** Artifact subtypes (ISO 32000-1 14.8.2.2). Artifacts are excluded from the structure tree. */
public enum ArtifactType {
    /** Running heads, folios, page numbers. Required by PDF/UA-1 clause 7.8. */
    PAGINATION("Pagination"),
    /** Rules, boxes, and other layout ornamentation. */
    LAYOUT("Layout"),
    /** Cut marks and colour bars. */
    PAGE("Page"),
    /** Background graphics with no informational content. */
    BACKGROUND("Background");

    private final String subtype;

    ArtifactType(String subtype) {
        this.subtype = subtype;
    }

    public String subtype() {
        return subtype;
    }
}
