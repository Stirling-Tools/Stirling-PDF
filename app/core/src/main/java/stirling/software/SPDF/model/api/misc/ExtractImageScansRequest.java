package stirling.software.SPDF.model.api.misc;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.AssertTrue;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.SingleFileInput;

@Data
@EqualsAndHashCode
public class ExtractImageScansRequest implements SingleFileInput {
    @Schema(description = "The input file containing image scans", format = "binary")
    private MultipartFile fileInput;

    @Schema(
            description =
                    "Server-side file reference. Either a job file id from an async run, or a"
                            + " persistent storage reference of the form storage:<id>.")
    private String fileId;

    @AssertTrue(message = "Either fileInput or fileId must be provided")
    @Schema(hidden = true)
    private boolean isValid() {
        return fileInput != null || (fileId != null && !fileId.trim().isEmpty());
    }

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
