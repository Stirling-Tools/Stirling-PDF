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
            description =
                    "Page box each source page is measured from when computing the scale. Pages"
                            + " without that box fall back to their MediaBox",
            allowableValues = {"MEDIA_BOX", "CROP_BOX", "TRIM_BOX", "BLEED_BOX", "ART_BOX"},
            defaultValue = "MEDIA_BOX")
    private String pageBox = "MEDIA_BOX";
}
