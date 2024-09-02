package stirling.software.SPDF.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import stirling.software.SPDF.model.api.PDFWithPageSize;

@Data
@EqualsAndHashCode(callSuper = true)
public class ScalePagesRequest extends PDFWithPageSize {

    @Schema(
            description =
                    "The scale of the content on the pages of the output PDF. Acceptable values are floats.")
    private float scaleFactor;
}
