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

    @Schema(
            description =
                    "Single-line values to redact, copied verbatim from the document. Use this"
                            + " for names, IDs, phone numbers, email addresses, dates, and other"
                            + " values that appear on a single line. Do NOT use for multi-line"
                            + " sections (use textRanges instead) or for mathematical expressions"
                            + " typeset as glyphs (use imageBoxes).")
    private List<String> textsToRedact;

    @Schema(
            description =
                    "Java-compatible regex patterns for structured data classes the user described"
                            + " without naming specific values (e.g. 'all phone numbers', 'all"
                            + " emails'). Write precise, well-anchored patterns - for example,"
                            + " email: [a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}, UK"
                            + " postcode: [A-Z]{1,2}\\d[A-Z\\d]?\\s?\\d[A-Z]{2}, ISO date:"
                            + " \\b\\d{4}-\\d{2}-\\d{2}\\b. Leave empty when the user named the"
                            + " specific strings (use textsToRedact) or described semantic content"
                            + " requiring a document scan.")
    private List<String> regexPatterns;

    @Schema(
            description =
                    "1-based page numbers to wipe entirely. Use ONLY for explicit whole-page"
                            + " requests like 'redact page 2' or 'blackout page 5'. Do NOT use for"
                            + " a section that happens to be on a page (use textRanges).")
    private List<Integer> pageNumbers;

    @Schema(
            description =
                    "Multi-line sections to redact, each defined by a verbatim start heading and"
                            + " an exclusive end heading. Emit ONE entry per contiguous block — for"
                            + " 'sections 10-14', emit five entries, not one. Headings must be"
                            + " copied EXACTLY as they appear in the extracted text, including any"
                            + " letter-spacing (e.g. 'T a b l e o f c o n t e n t s'). Use for"
                            + " exercises, chapters, appendices, clauses, and any range that spans"
                            + " more than one line.")
    private List<RedactTextRange> textRanges;

    @Schema(
            description =
                    "Images to redact identified by bounding box. Read the box coordinates from"
                            + " the '--- Images on this page ---' annotations in the extracted"
                            + " page text — each entry there lists position, size, and exact"
                            + " bounds. Use this for: spatial targeting ('the logo in the top"
                            + " left'), exclusion ('all images except the logo' — list every image"
                            + " EXCEPT the excluded ones), and mathematical content typeset as"
                            + " glyphs (equations and formulas — NEVER redact those via"
                            + " textsToRedact, the result is scattered single-character boxes).")
    private List<RedactImageBox> imageBoxes;

    @Schema(
            description =
                    "1-based page numbers to scan for images when redactAllImages is true. Empty"
                            + " means scan every page.")
    private List<Integer> imagePages;

    @Schema(
            description =
                    "Set to true when the user wants every image redacted with no spatial filter"
                            + " or exclusion (e.g. 'redact all images', 'remove all images on page"
                            + " 2'). For specific images by location or with exclusions, use"
                            + " imageBoxes instead.",
            defaultValue = "false")
    private Boolean redactAllImages;

    @Schema(
            description =
                    "Hex colour for the redaction fill (e.g. '#000000' black, '#ffffff' white,"
                            + " '#ff0000' red). Extract from the user's prompt only if they"
                            + " specify a colour; otherwise leave as default.",
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
