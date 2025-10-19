package stirling.software.SPDF.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class MergeMultiplePagesRequest extends PDFFile {

    @Schema(
            description = "The number of pages to fit onto a single sheet in the output PDF.",
            type = "number",
            defaultValue = "2",
            requiredMode = Schema.RequiredMode.REQUIRED,
            allowableValues = {"2", "3", "4", "9", "16"})
    private int pagesPerSheet;

    @Schema(
            description = "The orientation of the output PDF pages",
            type = "string",
            defaultValue = "PORTRAIT",
            allowableValues = {"PORTRAIT", "LANDSCAPE"})
    private String orientation;

    @Schema(description = "Boolean for if you wish to add border around the pages")
    private Boolean addBorder;
}
