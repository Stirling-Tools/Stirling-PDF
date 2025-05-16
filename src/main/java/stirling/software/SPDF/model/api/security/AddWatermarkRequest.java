package stirling.software.SPDF.model.api.security;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFFile;

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
}
