package stirling.software.SPDF.model.api.security;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.DecimalMin;
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
    private String watermarkText = "Stirling Software";

    @Schema(description = "The watermark image")
    private MultipartFile watermarkImage;

    @Schema(
            description = "The selected alphabet",
            allowableValues = {"roman", "arabic", "japanese", "korean", "chinese", "thai"},
            defaultValue = "roman")
    private String alphabet = "roman";

    @Schema(description = "The font size of the watermark text", defaultValue = "30")
    @DecimalMin(value = "1.0", message = "Font size must be at least 1.0")
    private float fontSize = 30;

    @Schema(description = "The rotation of the watermark in degrees", defaultValue = "0")
    private float rotation = 0;

    @Schema(description = "The opacity of the watermark (0.0 - 1.0)", defaultValue = "0.5")
    private float opacity = 0.5f;

    @Schema(description = "The width spacer between watermark elements", defaultValue = "50")
    @Min(value = 0, message = "Width spacer must be non-negative")
    private int widthSpacer = 50;

    @Schema(description = "The height spacer between watermark elements", defaultValue = "50")
    @Min(value = 0, message = "Height spacer must be non-negative")
    private int heightSpacer = 50;

    @Schema(description = "The color for watermark", defaultValue = "#d3d3d3")
    private String customColor = "#d3d3d3";

    @Schema(
            description = "Convert the redacted PDF to an image",
            defaultValue = "false",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean convertPDFToImage = false;
}
