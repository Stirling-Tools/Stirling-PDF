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
            allowableValues = {"png", "jpeg", "jpg", "gif"})
    private String imageFormat;

    @Schema(
            description =
                    "Choose between a single image containing all pages or separate images for each page",
            allowableValues = {"single", "multiple"})
    private String singleOrMultiple;

    @Schema(
            description = "The color type of the output image(s)",
            allowableValues = {"color", "greyscale", "blackwhite"})
    private String colorType;

    @Schema(description = "The DPI (dots per inch) for the output image(s)")
    private String dpi;
}
