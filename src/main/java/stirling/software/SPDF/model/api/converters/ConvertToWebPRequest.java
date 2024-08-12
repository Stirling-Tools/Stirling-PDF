package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class ConvertToWebPRequest extends PDFFile {

    @Schema(description = "The DPI (dots per inch) for the output image(s)")
    private String dpi;

    @Schema(
            description =
                    "The quality of the output image(s), applicable for lossy formats like JPEG or WebP. Range: 0 (lowest) to 100 (highest)")
    private String quality;
}
