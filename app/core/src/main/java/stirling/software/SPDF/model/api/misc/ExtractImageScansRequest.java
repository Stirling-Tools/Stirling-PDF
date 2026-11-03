package stirling.software.SPDF.model.api.misc;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class ExtractImageScansRequest {
    @Schema(
            description = "The input file containing image scans",
            requiredMode = Schema.RequiredMode.REQUIRED,
            format = "binary")
    private MultipartFile fileInput;

    @Schema(
            description = "The angle threshold for the image scan extraction",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "10")
    private int angleThreshold = 10;

    @Schema(
            description = "The tolerance for the image scan extraction",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "30")
    private int tolerance = 30;

    @Schema(
            description = "The minimum area for the image scan extraction",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "10000")
    private int minArea = 10000;

    @Schema(
            description = "The minimum contour area for the image scan extraction",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "500")
    private int minContourArea = 500;

    @Schema(
            description = "The border size for the image scan extraction",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "1")
    private int borderSize = 1;
}
