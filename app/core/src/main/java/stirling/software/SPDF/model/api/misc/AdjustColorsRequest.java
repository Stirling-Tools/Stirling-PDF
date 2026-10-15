package stirling.software.SPDF.model.api.misc;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class AdjustColorsRequest extends PDFFile {

    @Schema(
            description = "Contrast as a percentage; 100 leaves it unchanged",
            minimum = "0",
            maximum = "200",
            defaultValue = "100")
    @Min(0)
    @Max(200)
    private int contrast = 100;

    @Schema(
            description = "Brightness as a percentage; 100 leaves it unchanged",
            minimum = "0",
            maximum = "200",
            defaultValue = "100")
    @Min(0)
    @Max(200)
    private int brightness = 100;

    @Schema(
            description = "Saturation as a percentage; 100 leaves it unchanged",
            minimum = "0",
            maximum = "200",
            defaultValue = "100")
    @Min(0)
    @Max(200)
    private int saturation = 100;

    @Schema(
            description = "Red channel gain as a percentage; 100 leaves it unchanged",
            minimum = "0",
            maximum = "200",
            defaultValue = "100")
    @Min(0)
    @Max(200)
    private int red = 100;

    @Schema(
            description = "Green channel gain as a percentage; 100 leaves it unchanged",
            minimum = "0",
            maximum = "200",
            defaultValue = "100")
    @Min(0)
    @Max(200)
    private int green = 100;

    @Schema(
            description = "Blue channel gain as a percentage; 100 leaves it unchanged",
            minimum = "0",
            maximum = "200",
            defaultValue = "100")
    @Min(0)
    @Max(200)
    private int blue = 100;
}
