package stirling.software.common.pdf.ua;

/** The PDF/UA conformance level a conversion targets. */
public enum PdfUaProfile {
    /** ISO 14289-1, layered on PDF 1.7. */
    UA1(1, 1.7f, 0),
    /** ISO 14289-2: needs PDF 2.0, namespaced structure types and a revision year. */
    UA2(2, 2.0f, 2024);

    private final int part;
    private final float pdfVersion;
    private final int revision;

    PdfUaProfile(int part, float pdfVersion, int revision) {
        this.part = part;
        this.pdfVersion = pdfVersion;
        this.revision = revision;
    }

    public int part() {
        return part;
    }

    public float pdfVersion() {
        return pdfVersion;
    }

    /** The {@code pdfuaid:rev} year, or 0 when the profile does not use one. */
    public int revision() {
        return revision;
    }

    public String displayName() {
        return "PDF/UA-" + part;
    }

    public static PdfUaProfile fromRequest(String value) {
        if (value == null || value.isBlank()) {
            return UA1;
        }
        String normalised = value.trim().toLowerCase().replace("/", "").replace("-", "");
        return switch (normalised) {
            case "ua2", "pdfua2", "2" -> UA2;
            default -> UA1;
        };
    }
}
