package stirling.software.SPDF.model.api.misc;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class RemoveBlankPagesRequest extends PDFFile {

    @Schema(
            description = "The threshold value to determine blank pages",
            requiredMode = Schema.RequiredMode.REQUIRED,
            minimum = "0",
            maximum = "255",
            defaultValue = "10")
    private int threshold;

    @Schema(
            description = "The percentage of white color on a page to consider it as blank",
            requiredMode = Schema.RequiredMode.REQUIRED,
            minimum = "0.1",
            maximum = "100",
            defaultValue = "99.9")
    private float whitePercent;
}
