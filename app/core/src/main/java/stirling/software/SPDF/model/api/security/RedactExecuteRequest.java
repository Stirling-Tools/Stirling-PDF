package stirling.software.SPDF.model.api.security;

import java.util.ArrayList;
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

    @Schema(description = "Single-line values to redact", defaultValue = "[]")
    private List<String> textsToRedact = new ArrayList<>();

    @Schema(description = "Regex patterns to redact", defaultValue = "[]")
    private List<String> regexPatterns = new ArrayList<>();

    @Schema(description = "1-based page numbers to redact entirely", defaultValue = "[]")
    private List<Integer> pageNumbers = new ArrayList<>();

    @Schema(description = "Multi-line sections to redact", defaultValue = "[]")
    private List<RedactTextRange> textRanges = new ArrayList<>();

    @Schema(description = "Images to redact by bounding box", defaultValue = "[]")
    private List<RedactImageBox> imageBoxes = new ArrayList<>();

    @Schema(
            description = "1-based page numbers to scan for images when redactAllImages is true",
            defaultValue = "[]")
    private List<Integer> imagePages = new ArrayList<>();

    @Schema(description = "Redact every image", defaultValue = "false")
    private boolean redactAllImages = false;

    @Schema(
            description = "Hex colour for the redaction fill",
            defaultValue = "#000000",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String redactColor = "#000000";

    @Schema(
            description = "Extra padding (pts) around each redaction box",
            type = "number",
            defaultValue = "0")
    private float customPadding = 0f;

    @Schema(description = "Convert the redacted PDF to a flattened image", defaultValue = "false")
    private boolean convertPDFToImage = false;

    @Schema(
            description = "Execution strategy hint for the redaction pipeline",
            defaultValue = "AUTO")
    private RedactionStrategy strategy = RedactionStrategy.AUTO;
}
