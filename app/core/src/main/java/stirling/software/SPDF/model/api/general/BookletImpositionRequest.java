package stirling.software.SPDF.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class BookletImpositionRequest extends PDFFile {

    @Schema(
            description =
                    "The number of pages per side for booklet printing (always 2 for proper booklet).",
            type = "number",
            defaultValue = "2",
            requiredMode = Schema.RequiredMode.REQUIRED,
            allowableValues = {"2"})
    private int pagesPerSheet = 2;

    @Schema(description = "Boolean for if you wish to add border around the pages")
    private Boolean addBorder = false;

    @Schema(
            description = "The spine location for the booklet.",
            type = "string",
            defaultValue = "LEFT",
            allowableValues = {"LEFT", "RIGHT"})
    private String spineLocation = "LEFT";

    @Schema(description = "Add gutter margin (inner margin for binding)")
    private Boolean addGutter = false;

    @Schema(
            description = "Gutter margin size in points (used when addGutter is true)",
            type = "number",
            defaultValue = "12")
    private float gutterSize = 12f;

    @Schema(description = "Generate both front and back sides (double-sided printing)")
    private Boolean doubleSided = true;

    @Schema(
            description = "For manual duplex: which pass to generate",
            type = "string",
            defaultValue = "BOTH",
            allowableValues = {"BOTH", "FIRST", "SECOND"})
    private String duplexPass = "BOTH";

    @Schema(description = "Flip back sides for short-edge duplex printing (default is long-edge)")
    private Boolean flipOnShortEdge = false;
}
