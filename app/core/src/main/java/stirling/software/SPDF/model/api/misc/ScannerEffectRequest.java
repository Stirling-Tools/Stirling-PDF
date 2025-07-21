package stirling.software.SPDF.model.api.misc;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotNull;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class ScannerEffectRequest {
    public enum Quality {
        low,
        medium,
        high
    }

    public enum Rotation {
        none,
        slight,
        moderate,
        severe
    }

    public enum Colorspace {
        grayscale,
        color
    }

    @Schema(
            description = "PDF file to process",
            requiredMode = Schema.RequiredMode.REQUIRED,
            type = "string",
            format = "binary")
    @NotNull(message = "File input is required")
    private MultipartFile fileInput;

    @Schema(description = "Scan quality preset", example = "high")
    @NotNull(message = "Quality is required")
    private Quality quality = Quality.high;

    @Schema(description = "Rotation preset", example = "none")
    @NotNull(message = "Rotation is required")
    private Rotation rotation = Rotation.slight;

    @Schema(description = "Colorspace for output image", example = "grayscale")
    private Colorspace colorspace = Colorspace.grayscale;

    @Schema(description = "Border thickness in pixels", example = "20")
    private int border = 20;

    @Schema(description = "Base rotation in degrees", example = "0")
    private int rotate = 0;

    @Schema(description = "Random rotation variance in degrees", example = "2")
    private int rotateVariance = 2;

    @Schema(description = "Brightness multiplier (1.0 = no change)", example = "1.0")
    private float brightness = 1.0f;

    @Schema(description = "Contrast multiplier (1.0 = no change)", example = "1.0")
    private float contrast = 1.0f;

    @Schema(description = "Blur amount (0 = none, higher = more blur)", example = "1.0")
    private float blur = 1.0f;

    @Schema(description = "Noise amount (0 = none, higher = more noise)", example = "8.0")
    private float noise = 8.0f;

    @Schema(description = "Simulate yellowed paper", example = "false")
    private boolean yellowish = false;

    @Schema(description = "Rendering resolution in DPI", example = "300")
    private int resolution = 300;

    @Schema(description = "Whether advanced settings are enabled", example = "false")
    private boolean advancedEnabled = false;

    public boolean isAdvancedEnabled() {
        return advancedEnabled;
    }

    public int getQualityValue() {
        return switch (quality) {
            case low -> 30;
            case medium -> 60;
            case high -> 100;
        };
    }

    public int getRotationValue() {
        return switch (rotation) {
            case none -> 0;
            case slight -> 2;
            case moderate -> 5;
            case severe -> 8;
        };
    }

    public void applyHighQualityPreset() {
        this.blur = 0.1f;
        this.noise = 1.0f;
        this.brightness = 1.02f;
        this.contrast = 1.05f;
        this.resolution = 600;
    }

    public void applyMediumQualityPreset() {
        this.blur = 0.5f;
        this.noise = 3.0f;
        this.brightness = 1.05f;
        this.contrast = 1.1f;
        this.resolution = 300;
    }

    public void applyLowQualityPreset() {
        this.blur = 1.0f;
        this.noise = 5.0f;
        this.brightness = 1.1f;
        this.contrast = 1.2f;
        this.resolution = 150;
    }
}
