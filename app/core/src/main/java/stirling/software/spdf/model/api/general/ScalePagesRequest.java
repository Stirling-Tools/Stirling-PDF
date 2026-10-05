package stirling.software.spdf.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.spdf.model.api.PDFWithPageSize;

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
}
