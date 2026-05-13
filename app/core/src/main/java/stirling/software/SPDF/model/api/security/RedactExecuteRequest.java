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

    @Schema(description = "Single-line values to redact")
    private List<String> textsToRedact;

    @Schema(description = "Regex patterns to redact")
    private List<String> regexPatterns;

    @Schema(description = "1-based page numbers to redact entirely")
    private List<Integer> pageNumbers;

    @Schema(description = "Multi-line sections to redact")
    private List<RedactTextRange> textRanges;

    @Schema(description = "Images to redact by bounding box")
    private List<RedactImageBox> imageBoxes;

    @Schema(description = "1-based page numbers to scan for images when redactAllImages is true")
    private List<Integer> imagePages;

    @Schema(description = "Redact every image", defaultValue = "false")
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
