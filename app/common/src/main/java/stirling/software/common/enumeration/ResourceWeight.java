package stirling.software.common.enumeration;

/**
 * Standard resource-weight tiers for {@link
 * stirling.software.common.annotations.AutoJobPostMapping#resourceWeight()}.
 */
public final class ResourceWeight {

    /** Lightweight: rotate, page numbers, extract pages, permissions, etc. */
    public static final int SMALL_WEIGHT = 1;

    /** Medium: merge, split, multi-tool batch. */
    public static final int MEDIUM_WEIGHT = 3;

    /** Heavy: compress, OCR (small), conversions, raster. */
    public static final int LARGE_WEIGHT = 5;

    /** Extra heavy: OCR on large files, full-document re-render, AI-assisted edits. */
    public static final int XLARGE_WEIGHT = 10;

    private ResourceWeight() {}
}
