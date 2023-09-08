package stirling.software.SPDF.model.api.general;
import lombok.Data;
import stirling.software.SPDF.model.api.PDFFile;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;

@Data
public class CropPdfForm extends PDFFile {


    @Schema(description = "The x-coordinate of the top-left corner of the crop area", type = "number")
    private float x;

    @Schema(description = "The y-coordinate of the top-left corner of the crop area", type = "number")
    private float y;

    @Schema(description = "The width of the crop area", type = "number")
    private float width;

    @Schema(description = "The height of the crop area", type = "number")
    private float height;
}

