package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import org.springframework.web.multipart.MultipartFile;

@Data
public class ConvertToPdfRequest {

    @Schema(description = "The input images to be converted to a PDF file")
    private MultipartFile[] fileInput;

    @Schema(description = "Whether to stretch the images to fit the PDF page or maintain the aspect ratio", example = "false")
    private boolean stretchToFit;

    @Schema(description = "The color type of the output image(s)", allowableValues = {"color", "greyscale", "blackwhite"})
    private String colorType;

    @Schema(description = "Whether to automatically rotate the images to better fit the PDF page", example = "true")
    private boolean autoRotate;
}
