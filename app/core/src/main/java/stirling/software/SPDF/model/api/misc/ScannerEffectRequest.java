package stirling.software.SPDF.model.api.misc;

import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotNull;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class ScannerEffectRequest extends PDFFile {
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
            description = "Scan quality preset",
            example = "high",
            requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull(message = "Quality is required")
    private Quality quality = Quality.high;

    @Schema(
            description = "Rotation preset",
            example = "none",
            requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull(message = "Rotation is required")
    private Rotation rotation = Rotation.slight;

    @Schema(
            description = "Colorspace for output image",
            example = "grayscale",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Colorspace colorspace = Colorspace.grayscale;

    @Schema(
            description = "Border thickness in pixels",
            example = "20",
            minimum = "0",
            maximum = "100",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private int border = 20;

    @Schema(
            description = "Base rotation in degrees",
            example = "0",
            defaultValue = "0",
            minimum = "0",
            maximum = "15",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private int rotate = 0;

    @Schema(
            description = "Random rotation variance in degrees",
            example = "2",
            defaultValue = "2",
            minimum = "0",
            maximum = "10",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private int rotateVariance = 2;

    @Schema(
            description = "Brightness multiplier (1.0 = no change)",
            example = "1.0",
            defaultValue = "1.0",
            minimum = "0.5",
            maximum = "1.5",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private float brightness = 1.0f;

    @Schema(
            description = "Contrast multiplier (1.0 = no change)",
            example = "1.0",
            defaultValue = "1.0",
            minimum = "0.5",
            maximum = "1.5",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private float contrast = 1.0f;

    @Schema(
            description = "Blur amount (0 = none, higher = more blur)",
            example = "1.0",
            defaultValue = "1.0",
            minimum = "0.0",
            maximum = "5.0",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private float blur = 1.0f;

    @Schema(
            description = "Noise amount (0 = none, higher = more noise)",
            example = "8.0",
            defaultValue = "8.0",
            minimum = "0.0",
            maximum = "20.0",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private float noise = 8.0f;

    @Schema(
            description = "Simulate yellowed paper",
            example = "false",
            defaultValue = "false",
            allowableValues = {"true", "false"},
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean yellowish = false;

    @Schema(
            description = "Rendering resolution in DPI",
            example = "300",
            defaultValue = "300",
            minimum = "72",
            maximum = "600",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private int resolution = 300;

    @Schema(
            description = "Whether advanced settings are enabled",
            example = "false",
            defaultValue = "false",
            allowableValues = {"true", "false"},
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    @Hidden
    private Boolean advancedEnabled = false;

    @Hidden
    public int getQualityValue() {
        return switch (quality) {
            case low -> 30;
            case medium -> 60;
            case high -> 100;
        };
    }

    @Hidden
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
        this.resolution = 300;
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
