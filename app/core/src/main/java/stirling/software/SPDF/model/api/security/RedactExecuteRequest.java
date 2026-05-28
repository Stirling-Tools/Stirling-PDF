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

    @Schema(description = "Exact strings to find and black out. One entry per phrase to redact.")
    private List<String> textValues = new ArrayList<>();

    @Schema(
            description =
                    "Regex patterns — each match in the document is redacted. Use Java/PCRE syntax. Account for format variants: different separators, optional prefixes/suffixes, grouped vs ungrouped digits, locale spellings, etc.")
    private List<String> regexPatterns = new ArrayList<>();

    @Schema(
            description =
                    "1-indexed page numbers to wipe entirely (all content removed from those pages).")
    private List<Integer> wipePages = new ArrayList<>();

    @Schema(
            description =
                    "Text ranges to redact. Each entry specifies a short start and end anchor"
                            + " phrase (5–15 words each) taken from the extracted page text; all"
                            + " content between them (inclusive) is redacted. Keep anchors short"
                            + " and distinctive — do NOT use entire paragraphs. Both anchors must"
                            + " be exact short phrases present in the extracted text.")
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
                                    "A short phrase (5–15 words) marking where redaction begins"
                                            + " (inclusive). Copy it verbatim from the extracted page"
                                            + " text — do not paraphrase or reconstruct from memory."
                                            + " Use either a section heading alone (e.g. '#6: Image"
                                            + " resolution') or a short phrase from within the body"
                                            + " text alone — never combine a heading with the following"
                                            + " body text in a single anchor, as they may not be"
                                            + " contiguous in the extracted text.",
                            requiredMode = Schema.RequiredMode.REQUIRED,
                            minLength = 1)
                    String startString,
            @Schema(
                            description =
                                    "A short phrase (5–15 words) marking where redaction ends"
                                            + " (inclusive). Copy it verbatim from the extracted page"
                                            + " text — do not paraphrase or reconstruct from memory."
                                            + " Use a phrase from within the body text — shorter is"
                                            + " more reliable. Do not combine a section heading with"
                                            + " body text in a single anchor.",
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
