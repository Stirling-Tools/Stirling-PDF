package stirling.software.SPDF.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class MergeMultiplePagesRequest extends PDFFile {
    @Schema(
            description = "Input mode: DEFAULT uses pagesPerSheet; CUSTOM uses explicit cols×rows.",
            requiredMode = Schema.RequiredMode.REQUIRED,
            type = "string",
            defaultValue = "DEFAULT",
            allowableValues = {"DEFAULT", "CUSTOM"})
    private String mode;

    @Schema(
            description = "The number of pages to fit onto a single sheet in the output PDF.",
            type = "number",
            defaultValue = "2",
            allowableValues = {"2", "3", "4", "9", "16"})
    private int pagesPerSheet;

    @Schema(
            description = "Options for the ordering of pages",
            type = "string",
            defaultValue = "LR_TD",
            allowableValues = {"LR_TD", "RL_TD", "TD_LR", "TD_RL"})
    private String pageOrder;

    @Schema(
            description = "Number of rows",
            type = "number",
            defaultValue = "1",
            maximum = "300",
            minimum = "1",
            example = "3")
    private Integer rows;

    @Schema(
            description = "Number of columns",
            type = "number",
            defaultValue = "2",
            maximum = "300",
            minimum = "1",
            example = "2")
    private Integer cols;

    @Schema(
            description = "The orientation of the output PDF pages",
            type = "string",
            defaultValue = "PORTRAIT",
            allowableValues = {"PORTRAIT", "LANDSCAPE"})
    private String orientation;

    @Schema(description = "Boolean for if you wish to add border around the pages")
    private Boolean addBorder;
}
