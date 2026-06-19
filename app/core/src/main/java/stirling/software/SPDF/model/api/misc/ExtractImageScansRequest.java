package stirling.software.SPDF.model.api.misc;

import org.jboss.resteasy.reactive.RestForm;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.MultipartFile;

@Data
@EqualsAndHashCode
public class ExtractImageScansRequest {
    @RestForm("fileInput")
    @Schema(
            description = "The input file containing image scans",
            requiredMode = Schema.RequiredMode.REQUIRED,
            format = "binary")
    private MultipartFile fileInput;

    @RestForm("angleThreshold")
    @Schema(
            description = "The angle threshold for the image scan extraction",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "5")
    private int angleThreshold;

    @RestForm("tolerance")
    @Schema(
            description = "The tolerance for the image scan extraction",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "20")
    private int tolerance;

    @RestForm("minArea")
    @Schema(
            description = "The minimum area for the image scan extraction",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "8000")
    private int minArea;

    @RestForm("minContourArea")
    @Schema(
            description = "The minimum contour area for the image scan extraction",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "500")
    private int minContourArea;

    @RestForm("borderSize")
    @Schema(
            description = "The border size for the image scan extraction",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "1")
    private int borderSize;
}
