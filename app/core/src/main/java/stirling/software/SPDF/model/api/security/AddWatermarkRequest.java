package stirling.software.SPDF.model.api.security;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class AddWatermarkRequest extends PDFFile {

    @Schema(
            description = "The watermark type (text or image)",
            allowableValues = {"text", "image"},
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String watermarkType;

    @Schema(description = "The watermark text", defaultValue = "Stirling Software")
    private String watermarkText;

    @Schema(description = "The watermark image")
    private MultipartFile watermarkImage;

    @Schema(
            description = "The selected alphabet",
            allowableValues = {"roman", "arabic", "japanese", "korean", "chinese"},
            defaultValue = "roman")
    private String alphabet;

    @Schema(description = "The font size of the watermark text", defaultValue = "30")
    private float fontSize;

    @Schema(description = "The rotation of the watermark in degrees", defaultValue = "0")
    private float rotation;

    @Schema(description = "The opacity of the watermark (0.0 - 1.0)", defaultValue = "0.5")
    private float opacity;

    @Schema(description = "The width spacer between watermark elements", defaultValue = "50")
    private int widthSpacer;

    @Schema(description = "The height spacer between watermark elements", defaultValue = "50")
    private int heightSpacer;

    @Schema(description = "The color for watermark", defaultValue = "#d3d3d3")
    private String customColor;

    @Schema(
            description = "Convert the redacted PDF to an image",
            defaultValue = "false",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean convertPDFToImage;

    // New fields for enhanced watermarking (Phase 1)

    @Schema(description = "Number of watermark instances per page or document", defaultValue = "1")
    @Min(value = 1, message = "Count must be at least 1")
    @Max(value = 1000, message = "Count must not exceed 1000")
    private Integer count;

    @Schema(description = "Enable random positioning of watermarks", defaultValue = "false")
    private Boolean randomPosition;

    @Schema(
            description = "Minimum rotation angle in degrees (used when rotation range is enabled)",
            defaultValue = "0")
    @DecimalMin(value = "-360.0", message = "Rotation minimum must be >= -360")
    @DecimalMax(value = "360.0", message = "Rotation minimum must be <= 360")
    private Float rotationMin;

    @Schema(
            description = "Maximum rotation angle in degrees (used when rotation range is enabled)",
            defaultValue = "0")
    @DecimalMin(value = "-360.0", message = "Rotation maximum must be >= -360")
    @DecimalMax(value = "360.0", message = "Rotation maximum must be <= 360")
    private Float rotationMax;

    @Schema(description = "Enable random mirroring of watermarks", defaultValue = "false")
    private Boolean randomMirroring;

    @Schema(
            description = "Probability of mirroring when randomMirroring is enabled (0.0 - 1.0)",
            defaultValue = "0.5")
    @DecimalMin(value = "0.0", message = "Mirroring probability must be >= 0.0")
    @DecimalMax(value = "1.0", message = "Mirroring probability must be <= 1.0")
    private Float mirroringProbability;

    @Schema(description = "Specific font name to use for text watermarks")
    private String fontName;

    @Schema(
            description = "Enable random font selection for text watermarks",
            defaultValue = "false")
    private Boolean randomFont;

    @Schema(
            description = "Minimum font size (used when font size range is enabled)",
            defaultValue = "10")
    @DecimalMin(value = "1.0", message = "Font size minimum must be >= 1.0")
    @DecimalMax(value = "500.0", message = "Font size minimum must be <= 500.0")
    private Float fontSizeMin;

    @Schema(
            description = "Maximum font size (used when font size range is enabled)",
            defaultValue = "100")
    @DecimalMin(value = "1.0", message = "Font size maximum must be >= 1.0")
    @DecimalMax(value = "500.0", message = "Font size maximum must be <= 500.0")
    private Float fontSizeMax;

    @Schema(description = "Enable random color selection for watermarks", defaultValue = "false")
    private Boolean randomColor;

    @Schema(
            description = "Enable per-letter font variation in text watermarks",
            defaultValue = "false")
    private Boolean perLetterFont;

    @Schema(
            description = "Enable per-letter color variation in text watermarks",
            defaultValue = "false")
    private Boolean perLetterColor;

    @Schema(
            description = "Enable per-letter size variation in text watermarks",
            defaultValue = "false")
    private Boolean perLetterSize;

    @Schema(
            description = "Enable per-letter orientation variation in text watermarks",
            defaultValue = "false")
    private Boolean perLetterOrientation;

    @Schema(
            description = "Number of fonts to randomly select from for per-letter font variation",
            defaultValue = "2")
    @Min(value = 1, message = "Font count must be at least 1")
    @Max(value = 20, message = "Font count must not exceed 20")
    private Integer perLetterFontCount;

    @Schema(description = "Minimum font size for per-letter size variation", defaultValue = "10")
    @DecimalMin(value = "1.0", message = "Per-letter size minimum must be >= 1.0")
    @DecimalMax(value = "500.0", message = "Per-letter size minimum must be <= 500.0")
    private Float perLetterSizeMin;

    @Schema(description = "Maximum font size for per-letter size variation", defaultValue = "100")
    @DecimalMin(value = "1.0", message = "Per-letter size maximum must be >= 1.0")
    @DecimalMax(value = "500.0", message = "Per-letter size maximum must be <= 500.0")
    private Float perLetterSizeMax;

    @Schema(
            description = "Number of colors to randomly select from for per-letter color variation",
            defaultValue = "4")
    @Min(value = 1, message = "Color count must be at least 1")
    @Max(value = 20, message = "Color count must not exceed 20")
    private Integer perLetterColorCount;

    @Schema(
            description = "Minimum rotation angle in degrees for per-letter orientation variation",
            defaultValue = "0")
    @DecimalMin(value = "-360.0", message = "Per-letter orientation minimum must be >= -360")
    @DecimalMax(value = "360.0", message = "Per-letter orientation minimum must be <= 360")
    private Float perLetterOrientationMin;

    @Schema(
            description = "Maximum rotation angle in degrees for per-letter orientation variation",
            defaultValue = "360")
    @DecimalMin(value = "-360.0", message = "Per-letter orientation maximum must be >= -360")
    @DecimalMax(value = "360.0", message = "Per-letter orientation maximum must be <= 360")
    private Float perLetterOrientationMax;

    @Schema(description = "Shading style for text watermarks (e.g., 'none', 'light', 'dark')")
    private String shading;

    @Schema(description = "Enable random shading selection for watermarks", defaultValue = "false")
    private Boolean shadingRandom;

    @Schema(description = "Random seed for deterministic randomness (optional, for testing)")
    private Long seed;

    @Schema(
            description = "Scale factor for image watermarks (1.0 = original size)",
            defaultValue = "1.0")
    @DecimalMin(value = "0.1", message = "Image scale must be >= 0.1")
    @DecimalMax(value = "10.0", message = "Image scale must be <= 10.0")
    private Float imageScale;
}
