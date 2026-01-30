package stirling.software.SPDF.service.pdfjson.type3;

import java.io.IOException;

import stirling.software.SPDF.model.json.PdfJsonFontConversionCandidate;

public interface Type3ConversionStrategy {

    /** Unique identifier used when reporting results. */
    String getId();

    /** Human-readable label for UI toggles or logs. */
    String getLabel();

    /** True when the underlying tooling is usable on this host. */
    boolean isAvailable();

    /** Quick predicate to avoid running on unsupported Type3 shapes. */
    default boolean supports(Type3ConversionRequest request, Type3GlyphContext context)
            throws IOException {
        return request != null && request.getFont() != null;
    }

    /**
     * Attempt to synthesise a font program for the supplied Type3 font.
     *
     * @param request contextual information for the conversion attempt
     * @return a candidate describing the outcome, never {@code null}
     */
    PdfJsonFontConversionCandidate convert(
            Type3ConversionRequest request, Type3GlyphContext context) throws IOException;
}
