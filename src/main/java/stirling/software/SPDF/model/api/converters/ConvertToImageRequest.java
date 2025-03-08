package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class ConvertToImageRequest extends PDFFile {

    @Schema(
            description = "The output image format",
            allowableValues = {"png", "jpeg", "jpg", "gif", "webp"})
    private String imageFormat;

    @Schema(
            description =
                    "Choose between a single image containing all pages or separate images for each page",
            allowableValues = {"single", "multiple"})
    private String singleOrMultiple;

    @Schema(
            description =
                    "The pages to select, Supports ranges (e.g., '1,3,5-9'), or 'all' or functions in the format 'an+b' where 'a' is the multiplier of the page number 'n', and 'b' is a constant (e.g., '2n+1', '3n', '6n-5')\"")
    private String pageNumbers;

    @Schema(
            description = "The color type of the output image(s)",
            allowableValues = {"color", "greyscale", "blackwhite"})
    private String colorType;

    @Schema(description = "The DPI (dots per inch) for the output image(s)")
    private String dpi;
}
