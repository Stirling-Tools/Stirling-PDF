package stirling.software.SPDF.model.api.security;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class RedactPdfRequest extends PDFFile {

    @Schema(
            description = "List of text to redact from the PDF",
            type = "string",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String listOfText;

    @Schema(description = "Whether to use regex for the listOfText", defaultValue = "false")
    private boolean useRegex;

    @Schema(description = "Whether to use whole word search", defaultValue = "false")
    private boolean wholeWordSearch;

    @Schema(description = "The color for redaction", defaultValue = "#000000")
    private String redactColor = "#000000";

    @Schema(description = "Custom padding for redaction", type = "number")
    private float customPadding;

    @Schema(description = "Convert the redacted PDF to an image", defaultValue = "false")
    private boolean convertPDFToImage;
}
