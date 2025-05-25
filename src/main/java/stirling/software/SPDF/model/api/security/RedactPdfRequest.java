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
            defaultValue = "text,text2",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String listOfText;

    @Schema(
            description = "Whether to use regex for the listOfText",
            defaultValue = "false",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean useRegex;

    @Schema(
            description = "Whether to use whole word search",
            defaultValue = "false",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean wholeWordSearch;

    @Schema(
            description = "The color for redaction",
            defaultValue = "#000000",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String redactColor;

    @Schema(
            description = "Custom padding for redaction",
            type = "number",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private float customPadding;

    @Schema(
            description = "Convert the redacted PDF to an image",
            defaultValue = "false",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean convertPDFToImage;
}
