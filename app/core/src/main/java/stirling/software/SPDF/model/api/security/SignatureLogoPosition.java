package stirling.software.SPDF.model.api.security;

/**
 * Where the logo sits inside the visible signature box.
 *
 * <p>The identifiers are part of the API, so renaming one is a breaking change.
 */
public enum SignatureLogoPosition {

    /** Logo in a column down the left of the box, text to its right. */
    LEFT,

    /** Logo in a column down the right of the box, text to its left. */
    RIGHT,

    /** Logo in a band across the top of the box, text underneath. */
    TOP,

    /** Logo in a band across the bottom of the box, text above. */
    BOTTOM,

    /**
     * Logo scaled to the whole box and drawn under the text as a watermark. The text keeps the full
     * box, so this is the only position where the two overlap.
     */
    BEHIND
}
