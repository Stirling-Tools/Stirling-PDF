package stirling.software.SPDF.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class MergeMultiplePagesRequest extends PDFFile {

    @Schema(
            description =
                    "Input mode: DEFAULT uses pagesPerSheet; CUSTOM uses explicit cols x rows.",
            requiredMode = Schema.RequiredMode.REQUIRED,
            type = "string",
            defaultValue = "DEFAULT",
            allowableValues = {"DEFAULT", "CUSTOM"})
    private String mode;

    @Schema(
            description = "The number of pages to fit onto a single sheet in the output PDF.",
            type = "integer",
            allowableValues = {"2", "4", "9", "16"})
    private int pagesPerSheet = 2;

    @Schema(
            description =
                    "The arrangement of pages on the sheet: BY_ROWS fills pages row by row, while BY_COLUMNS fills pages column by column.",
            type = "string",
            defaultValue = "BY_ROWS",
            allowableValues = {"BY_ROWS", "BY_COLUMNS"})
    private String arrangement;

    @Schema(
            description =
                    "The direction in which pages are arranged on the sheet: LTR (left-to-right) or RTL (right-to-left).",
            type = "string",
            defaultValue = "LTR",
            allowableValues = {"LTR", "RTL"})
    private String readingDirection;

    @Schema(
            description = "Number of rows",
            type = "number",
            defaultValue = "1",
            maximum = "300",
            minimum = "1",
            example = "3")
    private int rows;

    @Schema(
            description = "Number of columns",
            type = "number",
            defaultValue = "2",
            maximum = "300",
            minimum = "1",
            example = "2")
    private int cols;

    @Schema(
            description = "The orientation of the output PDF pages",
            type = "string",
            defaultValue = "PORTRAIT",
            allowableValues = {"PORTRAIT", "LANDSCAPE"})
    private String orientation;

    @Schema(
            description = "Inner margin (in points) to apply around each page when merging",
            type = "number",
            defaultValue = "0",
            minimum = "0",
            example = "200")
    private int innerMargin;

    @Schema(
            description = "Top margin (in points) to apply to the output pages when merging",
            type = "number",
            defaultValue = "0",
            minimum = "0",
            example = "200")
    private int topMargin;

    @Schema(
            description = "Bottom margin (in points) to apply to the output pages when merging",
            type = "number",
            defaultValue = "0",
            minimum = "0",
            example = "200")
    private int bottomMargin;

    @Schema(
            description = "Left margin (in points) to apply to the output pages when merging",
            type = "number",
            defaultValue = "0",
            minimum = "0",
            example = "200")
    private int leftMargin;

    @Schema(
            description = "Right margin (in points) to apply to the output pages when merging",
            type = "number",
            defaultValue = "0",
            minimum = "0",
            example = "200")
    private int rightMargin;

    @Schema(
            description = "Border width (in points) to apply around each page when merging",
            type = "number",
            defaultValue = "1",
            minimum = "0",
            example = "2")
    private int borderWidth;

    @Schema(description = "Boolean for if you wish to add border around the pages")
    private Boolean addBorder;
}
