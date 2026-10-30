package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class ConvertPdfToCbzRequest extends PDFFile {

    @Schema(
            description = "The DPI (Dots Per Inch) for rendering PDF pages as images",
            example = "150",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private int dpi = 150;
}
