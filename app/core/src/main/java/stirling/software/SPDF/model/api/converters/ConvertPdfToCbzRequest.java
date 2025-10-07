package stirling.software.SPDF.model.api.converters;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class ConvertPdfToCbzRequest {

    @Schema(
            description = "The input PDF file to be converted to a CBZ file",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private MultipartFile fileInput;

    @Schema(
            description = "The DPI (Dots Per Inch) for rendering PDF pages as images",
            example = "150",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private int dpi = 150;
}
