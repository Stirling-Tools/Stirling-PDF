package stirling.software.SPDF.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class RotatePDFRequest extends PDFFile {

    @Schema(
            description =
                    "The angle by which to rotate the PDF file. This should be a multiple of 90.",
            example = "90")
    private Integer angle;
}
