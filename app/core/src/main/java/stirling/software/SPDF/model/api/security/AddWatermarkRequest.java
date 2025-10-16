package stirling.software.SPDF.model.api.security;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class AddWatermarkRequest extends PDFFile {

    @Schema(
            description = "The watermark type (text or image)",
            allowableValues = {"text", "image"},
            defaultValue = "text",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String watermarkType;

    @Schema(
            description = "The watermark text",
            defaultValue = "Stirling Software",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String watermarkText;

    @Schema(
            description = "The watermark image",
            contentMediaType = "image/*",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private MultipartFile watermarkImage;

    @Schema(
            description = "The selected alphabet",
            allowableValues = {"roman", "arabic", "japanese", "korean", "chinese", "thai"},
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "roman")
    private String alphabet;

    @Schema(
            description = "The font size of the watermark text",
            defaultValue = "30",
            minimum = "1",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private float fontSize;

    @Schema(
            description = "The rotation of the watermark in degrees",
            defaultValue = "45",
            minimum = "0",
            maximum = "360",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private float rotation;

    @Schema(
            description = "The opacity of the watermark (0% - 100%)",
            defaultValue = "50",
            minimum = "0",
            maximum = "100",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private float opacity;

    @Schema(
            description = "The width spacer between watermark elements in pixels",
            defaultValue = "50",
            minimum = "0",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private int widthSpacer;

    @Schema(
            description = "The height spacer between watermark elements in pixels",
            defaultValue = "50",
            minimum = "0",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private int heightSpacer;

    @Schema(
            description = "The color for watermark",
            defaultValue = "#d3d3d3",
            pattern = "^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$")
    private String customColor;

    @Schema(
            description = "Convert the redacted PDF to an image",
            defaultValue = "false",
            allowableValues = {"true", "false"},
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean convertPDFToImage;
}
