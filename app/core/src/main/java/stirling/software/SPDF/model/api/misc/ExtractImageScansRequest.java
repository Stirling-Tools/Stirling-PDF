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
            defaultValue = "5")
    private int angleThreshold;

    @Schema(
            description = "The tolerance for the image scan extraction",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "20")
    private int tolerance;

    @Schema(
            description = "The minimum area for the image scan extraction",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "8000")
    private int minArea;

    @Schema(
            description = "The minimum contour area for the image scan extraction",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "500")
    private int minContourArea;

    @Schema(
            description = "The border size for the image scan extraction",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "1")
    private int borderSize;
}
