package stirling.software.SPDF.model.api.security;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class RedactExecuteRequest extends PDFFile {

    public enum RedactionStrategy {
        AUTO,
        OVERLAY_ONLY,
        IMAGE_FINALIZE
    }

    @Schema(description = "Newline-separated exact strings to redact")
    private String textsToRedact;

    @Schema(description = "Newline-separated regex patterns to redact")
    private String regexPatterns;

    @Schema(description = "Comma-separated page numbers to fully redact")
    private String pageNumbers;

    @Schema(
            description =
                    "Flat list of start/end text pairs for range-based redaction. Must have an even number of elements.")
    private List<String> textRanges;

    @Schema(description = "Newline-separated image bounding boxes to redact (page,x1,y1,x2,y2)")
    private String imageBoxes;

    @Schema(
            description = "Comma-separated 1-based page numbers to scan for images",
            defaultValue = "")
    private String imagePages;

    @Schema(description = "Redact all detected images on the target pages", defaultValue = "false")
    private Boolean redactAllImages;

    @Schema(
            description = "Hex colour for the redaction fill",
            defaultValue = "#000000",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String redactColor;

    @Schema(description = "Extra padding (pts) around each redaction box", type = "number")
    private float customPadding;

    @Schema(description = "Convert the redacted PDF to a flattened image", defaultValue = "false")
    private Boolean convertPDFToImage;

    @Schema(description = "Execution strategy hint for the redaction pipeline")
    private RedactionStrategy strategy;
}
