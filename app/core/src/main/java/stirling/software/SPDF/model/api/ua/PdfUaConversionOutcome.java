package stirling.software.SPDF.model.api.ua;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * Result of a PDF/UA conversion.
 *
 * @param declared whether a {@code pdfuaid} conformance claim was written into {@code pdfBytes}
 */
@Schema(description = "Result of converting a document to PDF/UA")
public record PdfUaConversionOutcome(
        byte[] pdfBytes,
        boolean declared,
        UaValidationResult validation,
        TaggingSummary tagging,
        List<String> warnings) {

    @Schema(description = "What the tagging pass produced")
    public record TaggingSummary(
            boolean rebuiltStructure,
            int taggedElements,
            int artifacts,
            int figuresNeedingAltText) {}
}
