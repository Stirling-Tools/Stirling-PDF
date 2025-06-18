package stirling.software.SPDF.model.api.converters;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class ConvertToPdfRequest {

    @Schema(
            description = "The input images to be converted to a PDF file",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private MultipartFile[] fileInput;

    @Schema(
            description = "Option to determine how the image will fit onto the page",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "fillPage",
            allowableValues = {"fillPage", "fitDocumentToImage", "maintainAspectRatio"})
    private String fitOption;

    @Schema(
            description = "The color type of the output image(s)",
            defaultValue = "color",
            requiredMode = Schema.RequiredMode.REQUIRED,
            allowableValues = {"color", "greyscale", "blackwhite"})
    private String colorType;

    @Schema(
            description = "Whether to automatically rotate the images to better fit the PDF page",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "false")
    private Boolean autoRotate;
}
