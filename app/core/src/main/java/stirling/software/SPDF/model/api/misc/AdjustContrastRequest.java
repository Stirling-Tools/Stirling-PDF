package stirling.software.SPDF.model.api.misc;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

/** Each adjustment is a percentage from 0 to 200, where 100 leaves the page unchanged. */
@Data
@EqualsAndHashCode(callSuper = true)
public class AdjustContrastRequest extends PDFFile {

    @Schema(description = "Contrast in percent (100 = unchanged)", defaultValue = "100")
    @Min(0)
    @Max(200)
    private int contrast = 100;

    @Schema(description = "Brightness in percent (100 = unchanged)", defaultValue = "100")
    @Min(0)
    @Max(200)
    private int brightness = 100;

    @Schema(description = "Saturation in percent (100 = unchanged)", defaultValue = "100")
    @Min(0)
    @Max(200)
    private int saturation = 100;

    @Schema(description = "Red channel level in percent (100 = unchanged)", defaultValue = "100")
    @Min(0)
    @Max(200)
    private int red = 100;

    @Schema(description = "Green channel level in percent (100 = unchanged)", defaultValue = "100")
    @Min(0)
    @Max(200)
    private int green = 100;

    @Schema(description = "Blue channel level in percent (100 = unchanged)", defaultValue = "100")
    @Min(0)
    @Max(200)
    private int blue = 100;
}
