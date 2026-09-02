package stirling.software.SPDF.model.api.converters;

import org.jboss.resteasy.reactive.RestForm;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.MultipartFile;

@Data
@EqualsAndHashCode
public class ConvertToPdfRequest {

    @RestForm("fileInput")
    @Schema(
            description = "The input images to be converted to a PDF file",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private MultipartFile[] fileInput;

    @RestForm("fitOption")
    @Schema(
            description = "Option to determine how the image will fit onto the page",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "fillPage",
            allowableValues = {"fillPage", "fitDocumentToImage", "maintainAspectRatio"})
    private String fitOption;

    @RestForm("colorType")
    @Schema(
            description = "The color type of the output image(s)",
            defaultValue = "color",
            requiredMode = Schema.RequiredMode.REQUIRED,
            allowableValues = {"color", "greyscale", "blackwhite"})
    private String colorType;

    @RestForm("autoRotate")
    @Schema(
            description = "Whether to automatically rotate the images to better fit the PDF page",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "false")
    private Boolean autoRotate;
}
