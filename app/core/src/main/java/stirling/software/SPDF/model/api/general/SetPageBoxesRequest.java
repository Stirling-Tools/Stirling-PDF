package stirling.software.SPDF.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class SetPageBoxesRequest extends PDFFile {

    @Schema(
            description = "MediaBox as \"x,y,width,height\" in points, applied to every page",
            example = "0,0,595.28,841.89")
    private String mediaBox;

    @Schema(
            description = "CropBox as \"x,y,width,height\" in points, applied to every page",
            example = "0,0,595.28,841.89")
    private String cropBox;

    @Schema(
            description = "TrimBox as \"x,y,width,height\" in points, applied to every page",
            example = "20,20,555.28,801.89")
    private String trimBox;

    @Schema(
            description = "BleedBox as \"x,y,width,height\" in points, applied to every page",
            example = "14.17,14.17,567.11,813.71")
    private String bleedBox;

    @Schema(
            description = "ArtBox as \"x,y,width,height\" in points, applied to every page",
            example = "20,20,555.28,801.89")
    private String artBox;

    @Schema(
            description =
                    "BleedBox expanded by this many millimetres around the resolved TrimBox on"
                            + " every page. Ignored when bleedBox is set",
            minimum = "0",
            defaultValue = "0")
    private float bleedMm = 0;

    @Schema(
            description =
                    "TrimBox set to the MediaBox shrunk by this margin in millimetres on every"
                            + " side. Ignored when trimBox is set",
            minimum = "0",
            defaultValue = "0")
    private float trimMarginMm = 0;

    @Schema(
            description =
                    "Copy the MediaBox into any of CropBox/TrimBox/BleedBox/ArtBox still unset"
                            + " after the other parameters are applied",
            type = "boolean",
            defaultValue = "false")
    private boolean copyMissingFromMediaBox = false;
}
