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

    @Schema(description = "Exact strings to redact, each copied verbatim from the document.")
    private List<String> textsToRedact;

    @Schema(description = "Java-compatible regex patterns to find and redact.")
    private List<String> regexPatterns;

    @Schema(description = "1-based page numbers to fully wipe.")
    private List<Integer> pageNumbers;

    @Schema(
            description =
                    "Named sections to redact, each defined by a start heading and an exclusive end"
                            + " heading. One entry per contiguous block. Non-contiguous blocks must"
                            + " each have their own entry.")
    private List<RedactTextRange> textRanges;

    @Schema(
            description =
                    "Images to redact, identified by 0-based page index and PDF user-space bounding"
                            + " box (origin bottom-left).")
    private List<RedactImageBox> imageBoxes;

    @Schema(
            description =
                    "1-based page numbers to scan for images when redactAllImages is true. Empty"
                            + " means scan every page.")
    private List<Integer> imagePages;

    @Schema(
            description = "Redact every detected image on the target pages.",
            defaultValue = "false")
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
