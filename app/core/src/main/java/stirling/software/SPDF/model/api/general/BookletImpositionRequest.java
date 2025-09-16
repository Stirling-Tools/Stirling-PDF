package stirling.software.SPDF.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class BookletImpositionRequest extends PDFFile {

    @Schema(
            description = "The booklet type to create.",
            type = "string",
            defaultValue = "BOOKLET",
            requiredMode = Schema.RequiredMode.REQUIRED,
            allowableValues = {"BOOKLET", "SIDE_STITCH_BOOKLET"})
    private String bookletType = "BOOKLET";

    @Schema(
            description = "The number of pages to fit onto a single sheet in the output PDF.",
            type = "number",
            defaultValue = "2",
            requiredMode = Schema.RequiredMode.REQUIRED,
            allowableValues = {"2", "4"})
    private int pagesPerSheet = 2;

    @Schema(description = "Boolean for if you wish to add border around the pages")
    private Boolean addBorder = false;

    @Schema(
            description = "The page orientation for the output booklet sheets.",
            type = "string",
            defaultValue = "LANDSCAPE",
            requiredMode = Schema.RequiredMode.REQUIRED,
            allowableValues = {"LANDSCAPE", "PORTRAIT"})
    private String pageOrientation = "LANDSCAPE";
}
