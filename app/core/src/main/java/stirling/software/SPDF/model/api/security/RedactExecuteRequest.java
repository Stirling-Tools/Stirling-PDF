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

    @Schema(
            description =
                    "Exact strings to find and black out. One entry per phrase to redact."
                            + " Best for known names, identifiers, and specific text found in the document.")
    private List<String> textValues = new ArrayList<>();

    @Schema(
            description =
                    "Regex patterns to match and redact. Each match anywhere in the document is blacked out."
                            + " Uses Java/PCRE regex syntax. Well-suited for strings that follow known patterns, like"
                            + " phone numbers, email addresses, national ID numbers, or"
                            + " dates (which can appear with different separators, optional country codes,"
                            + " etc.). For fixed known strings such as names, use textValues instead.")
    private List<String> regexPatterns = new ArrayList<>();

    @Schema(
            description =
                    "1-indexed page numbers to wipe entirely (all content removed from those pages).")
    private List<Integer> wipePages = new ArrayList<>();

    @Schema(
            description =
                    "Text ranges to redact by specifying a start and end anchor phrase. All"
                            + " content between the two phrases (inclusive) is redacted. Anchors"
                            + " work best when short and unique. They must appear"
                            + " verbatim in the document.")
    private List<TextRange> ranges = new ArrayList<>();

    @Schema(
            description =
                    "Rectangular areas to black out, each defined by a page number and bounding box coordinates.")
    private List<ImageBox> imageBoxes = new ArrayList<>();

    @Schema(
            description =
                    "1-indexed page numbers to redact all detected images from. Pass an empty list to redact images from every page. Omit or pass null to skip image redaction entirely.")
    private List<Integer> redactImagePages;

    @Schema(description = "Redaction style options")
    private RedactStyle style = new RedactStyle();

    public record TextRange(
            @Schema(
                            description =
                                    "A short, distinctive phrase (5–15 words) that marks where"
                                            + " redaction begins (inclusive). Must appear verbatim in"
                                            + " the document — e.g. a section heading or a unique"
                                            + " sentence fragment.",
                            requiredMode = Schema.RequiredMode.REQUIRED,
                            minLength = 1)
                    String startString,
            @Schema(
                            description =
                                    "A short, distinctive phrase (5–15 words) that marks where"
                                            + " redaction ends (inclusive). Must appear verbatim in the"
                                            + " document. Shorter phrases match more reliably.",
                            requiredMode = Schema.RequiredMode.REQUIRED,
                            minLength = 1)
                    String endString) {
        public TextRange {
            if (endString == null) endString = "";
        }
    }

    public record ImageBox(
            @Schema(
                            description = "0-indexed page number (first page = 0).",
                            requiredMode = Schema.RequiredMode.REQUIRED)
                    int pageIndex,
            @Schema(
                            description =
                                    "Left x coordinate of the redaction rectangle in PDF user-space points.",
                            requiredMode = Schema.RequiredMode.REQUIRED)
                    float x1,
            @Schema(
                            description =
                                    "Top y coordinate of the redaction rectangle in PDF user-space points.",
                            requiredMode = Schema.RequiredMode.REQUIRED)
                    float y1,
            @Schema(
                            description =
                                    "Right x coordinate of the redaction rectangle in PDF user-space points.",
                            requiredMode = Schema.RequiredMode.REQUIRED)
                    float x2,
            @Schema(
                            description =
                                    "Bottom y coordinate of the redaction rectangle in PDF user-space points.",
                            requiredMode = Schema.RequiredMode.REQUIRED)
                    float y2) {}

    public enum RedactionStrategy {
        AUTO,
        OVERLAY_ONLY,
        IMAGE_FINALIZE
    }

    @Data
    public static class RedactStyle {
        @Schema(description = "Hex redaction box color", defaultValue = "#000000")
        private String color = "#000000";

        @Schema(
                description = "Extra padding around each box in points",
                type = "number",
                defaultValue = "0")
        private float padding = 0f;

        @Schema(description = "Rasterize output to prevent text extraction", defaultValue = "false")
        private boolean convertToImage = false;

        @Schema(
                description = "Execution strategy hint for the redaction pipeline",
                defaultValue = "AUTO")
        private RedactionStrategy strategy = RedactionStrategy.AUTO;
    }
}
