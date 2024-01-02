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
            required = true)
    private String watermarkType;

    @Schema(description = "The watermark text")
    private String watermarkText;

    @Schema(description = "The watermark image")
    private MultipartFile watermarkImage;

    @Schema(
            description = "The selected alphabet",
            allowableValues = {"roman", "arabic", "japanese", "korean", "chinese"},
            defaultValue = "roman")
    private String alphabet = "roman";

    @Schema(description = "The font size of the watermark text", example = "30")
    private float fontSize = 30;

    @Schema(description = "The rotation of the watermark in degrees", example = "0")
    private float rotation = 0;

    @Schema(description = "The opacity of the watermark (0.0 - 1.0)", example = "0.5")
    private float opacity;

    @Schema(description = "The width spacer between watermark elements", example = "50")
    private int widthSpacer;

    @Schema(description = "The height spacer between watermark elements", example = "50")
    private int heightSpacer;
}
