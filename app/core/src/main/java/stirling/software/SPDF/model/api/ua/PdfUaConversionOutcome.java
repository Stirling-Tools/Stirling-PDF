package stirling.software.SPDF.model.api.ua;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * The result of a PDF/UA conversion.
 *
 * @param pdfBytes the converted file, declared conformant only when {@code declared} is true
 * @param declared whether a {@code pdfuaid} conformance claim was written
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
