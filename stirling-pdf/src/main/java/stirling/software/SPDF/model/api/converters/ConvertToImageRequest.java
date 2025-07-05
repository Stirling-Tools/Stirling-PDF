package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotNull;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFWithPageNums;

@Data
@EqualsAndHashCode(callSuper = true)
public class ConvertToImageRequest extends PDFWithPageNums {

    @Schema(
            description = "The output image format",
            defaultValue = "png",
            allowableValues = {"png", "jpeg", "jpg", "gif", "webp"},
            requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull
    private String imageFormat;

    @Schema(
            description =
                    "Choose between a single image containing all pages or separate images for each"
                            + " page",
            defaultValue = "multiple",
            allowableValues = {"single", "multiple"},
            requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull
    private String singleOrMultiple;

    @Schema(
            description = "The color type of the output image(s)",
            defaultValue = "color",
            allowableValues = {"color", "greyscale", "blackwhite"},
            requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull
    private String colorType;

    @Schema(
            description = "The DPI (dots per inch) for the output image(s)",
            defaultValue = "300",
            requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull
    private Integer dpi;
}
