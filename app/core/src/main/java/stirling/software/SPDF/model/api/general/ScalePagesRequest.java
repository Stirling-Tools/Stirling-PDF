package stirling.software.SPDF.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFWithPageSize;

@Data
@EqualsAndHashCode(callSuper = true)
public class ScalePagesRequest extends PDFWithPageSize {

    @Schema(
            minimum = "0",
            defaultValue = "1",
            requiredMode = Schema.RequiredMode.REQUIRED,
            description =
                    "The scale of the content on the pages of the output PDF. Acceptable values are"
                            + " floats.")
    private float scaleFactor;

    @Schema(
            minimum = "0",
            exclusiveMinimum = true,
            description =
                    "Width of the output pages in customUnit. Required when pageSize is CUSTOM;"
                            + " between 3 points (about 1.06 mm) and 200 inches.")
    private Float customWidth;

    @Schema(
            minimum = "0",
            exclusiveMinimum = true,
            description =
                    "Height of the output pages in customUnit. Required when pageSize is CUSTOM;"
                            + " between 3 points (about 1.06 mm) and 200 inches.")
    private Float customHeight;

    @Schema(
            defaultValue = "mm",
            allowableValues = {"mm", "cm", "in"},
            description = "Unit of customWidth and customHeight.")
    private String customUnit = "mm";
}
