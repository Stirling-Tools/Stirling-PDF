package stirling.software.SPDF.model.api.misc;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class PagingSealRequest extends PDFFile {

    @Schema(description = "The seal image")
    private MultipartFile sealImage;

    @Schema(description = "The size of the seal", example = "150")
    private float sealSize;

    @Schema(description = "The opacity of the seal", example = "0.5")
    private float sealOpacity;

    @Schema(description = "The percentage of the seal to the first page", example = "30")
    private float firstPageSealRate;

    @Schema(description = "The y-axis position of the seal")
    private float drawY;
}
