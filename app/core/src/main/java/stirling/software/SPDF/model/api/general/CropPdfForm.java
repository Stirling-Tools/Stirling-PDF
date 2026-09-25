package stirling.software.SPDF.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class CropPdfForm extends PDFFile {

    @Schema(
            description = "The x-coordinate of the top-left corner of the crop area",
            type = "number")
    private Float x;

    @Schema(
            description = "The y-coordinate of the top-left corner of the crop area",
            type = "number")
    private Float y;

    @Schema(description = "The width of the crop area", type = "number")
    private Float width;

    @Schema(description = "The height of the crop area", type = "number")
    private Float height;

    @Schema(
            description = "Whether to remove text outside the crop area (keeps images)",
            type = "boolean")
    private boolean removeDataOutsideCrop = true;

    @Schema(description = "Enable auto-crop to detect and remove white space", type = "boolean")
    private boolean autoCrop = false;

    @Schema(
            description =
                    "Crop each page to the named page box instead of explicit x/y/width/height."
                            + " Ignored when autoCrop is true",
            type = "boolean",
            defaultValue = "false")
    private boolean cropToBox = false;

    @Schema(
            description =
                    "Page box used as the crop area when cropToBox is true. Pages without that box"
                            + " fall back to their MediaBox",
            allowableValues = {"MEDIA_BOX", "CROP_BOX", "TRIM_BOX", "BLEED_BOX", "ART_BOX"},
            defaultValue = "MEDIA_BOX")
    private String pageBox = "MEDIA_BOX";
}
