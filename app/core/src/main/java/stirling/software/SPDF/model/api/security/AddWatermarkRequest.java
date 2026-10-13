package stirling.software.SPDF.model.api.security;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

/** Optional fields default to what the add-watermark tool in the web UI sends. */
@Data
@EqualsAndHashCode(callSuper = true)
public class AddWatermarkRequest extends PDFFile {

    @Schema(
            description =
                    "The watermark type (text or image). When omitted, image is used if"
                            + " watermarkImage is supplied, otherwise text.",
            allowableValues = {"text", "image"})
    private String watermarkType;

    @Schema(description = "The watermark text, required when watermarkType is text")
    private String watermarkText;

    @Schema(
            description =
                    "The watermark image (PNG, JPEG, etc.), required when watermarkType is image."
                            + " Tiled across every page, each copy fontSize points high.")
    private MultipartFile watermarkImage;

    @Schema(
            description =
                    "Font script for watermarkText, which must match it: chinese, japanese,"
                            + " korean, arabic or thai, otherwise roman for Latin text. Characters"
                            + " the chosen font lacks make the call fail.",
            allowableValues = {"roman", "arabic", "japanese", "korean", "chinese", "thai"},
            defaultValue = "roman")
    private String alphabet = "roman";

    @Schema(
            description =
                    "Text size in points. For an image watermark, the height of each image in"
                            + " points.",
            defaultValue = "12")
    @DecimalMin(value = "1.0", message = "Font size must be at least 1.0")
    private float fontSize = 12f;

    @Schema(description = "The rotation of the watermark in degrees", defaultValue = "0")
    private float rotation = 0f;

    @Schema(description = "The opacity of the watermark (0.0 - 1.0)", defaultValue = "0.5")
    private float opacity = 0.5f;

    @Schema(
            description = "Hex colour of the watermark text, e.g. #FF0000 for red",
            defaultValue = "#d3d3d3")
    private String customColor = "#d3d3d3";

    @Schema(
            description =
                    "Flatten every page to an image after watermarking, so the watermark can't be"
                            + " removed as a separate object. Text is no longer selectable or"
                            + " searchable.",
            defaultValue = "false")
    private Boolean convertPDFToImage = false;

    @Schema(description = "The width spacer between watermark elements", defaultValue = "50")
    @Min(value = 0, message = "Width spacer must be non-negative")
    private int widthSpacer = 50;

    @Schema(description = "The height spacer between watermark elements", defaultValue = "50")
    @Min(value = 0, message = "Height spacer must be non-negative")
    private int heightSpacer = 50;
}
