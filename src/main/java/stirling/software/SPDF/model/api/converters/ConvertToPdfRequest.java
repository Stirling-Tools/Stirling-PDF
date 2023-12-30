package stirling.software.SPDF.model.api.converters;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class ConvertToPdfRequest {

    @Schema(description = "The input images to be converted to a PDF file")
    private MultipartFile[] fileInput;

    @Schema(
            description = "Option to determine how the image will fit onto the page",
            allowableValues = {"fillPage", "fitDocumentToImage", "maintainAspectRatio"})
    private String fitOption;

    @Schema(
            description = "The color type of the output image(s)",
            allowableValues = {"color", "greyscale", "blackwhite"})
    private String colorType;

    @Schema(
            description = "Whether to automatically rotate the images to better fit the PDF page",
            example = "true")
    private boolean autoRotate;
}
