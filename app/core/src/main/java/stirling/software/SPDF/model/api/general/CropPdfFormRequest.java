package stirling.software.SPDF.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class CropPdfFormRequest extends PDFFile {

    @Schema(
            description = "The x-coordinate of the top-left corner of the crop area",
            type = "number")
    private float x;

    @Schema(
            description = "The y-coordinate of the top-left corner of the crop area",
            type = "number")
    private float y;

    @Schema(description = "The width of the crop area", type = "number")
    private float width;

    @Schema(description = "The height of the crop area", type = "number")
    private float height;

    @Schema(
            description = "Whether to remove text outside the crop area (keeps images)",
            allowableValues = {"true", "false"},
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "true")
    private Boolean removeDataOutsideCrop = true;
}
