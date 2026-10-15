package stirling.software.SPDF.model.api.security;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class RedactPdfRequest extends PDFFile {

    @Schema(
            description =
                    "Text to redact, one term per line (not comma-separated); each line is"
                            + " a regex when useRegex=true",
            example = "text\ntext2",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String listOfText;

    @Schema(
            description = "Whether to use regex for the listOfText",
            defaultValue = "false",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean useRegex = false;

    @Schema(
            description = "Whether to use whole word search",
            defaultValue = "false",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean wholeWordSearch = false;

    @Schema(
            description = "Whether matching is case-sensitive, for plain text and regex alike",
            defaultValue = "false",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private Boolean caseSensitive = false;

    @Schema(
            description = "The color for redaction",
            defaultValue = "#000000",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String redactColor = "#000000";

    @Schema(
            description = "Extra space around each redaction box, in points",
            type = "number",
            defaultValue = "0",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private float customPadding = 0f;

    @Schema(
            description = "Turn pages into images so nothing under the boxes can be extracted",
            defaultValue = "false",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean convertPDFToImage = Boolean.FALSE;
}
