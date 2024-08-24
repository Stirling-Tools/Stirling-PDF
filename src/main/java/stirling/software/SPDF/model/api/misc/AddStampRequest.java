package stirling.software.SPDF.model.api.misc;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import stirling.software.SPDF.model.api.PDFWithPageNums;

@Data
@EqualsAndHashCode(callSuper = true)
public class AddStampRequest extends PDFWithPageNums {

    @Schema(
            description = "The stamp type (text or image)",
            allowableValues = {"text", "image"},
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String stampType;

    @Schema(description = "The stamp text")
    private String stampText;

    @Schema(description = "The stamp image")
    private MultipartFile stampImage;

    @Schema(
            description = "The selected alphabet",
            allowableValues = {"roman", "arabic", "japanese", "korean", "chinese"},
            defaultValue = "roman")
    private String alphabet = "roman";

    @Schema(description = "The font size of the stamp text", example = "30")
    private float fontSize = 30;

    @Schema(description = "The rotation of the stamp in degrees", example = "0")
    private float rotation = 0;

    @Schema(description = "The opacity of the stamp (0.0 - 1.0)", example = "0.5")
    private float opacity;

    @Schema(
            description =
                    "Position for stamp placement based on a 1-9 grid (1: bottom-left, 2: bottom-center, ..., 9: top-right)",
            example = "1")
    private int position;

    @Schema(
            description =
                    "Override X coordinate for stamp placement. If set, it will override the position-based calculation. Negative value means no override.",
            example = "-1")
    private float overrideX = -1; // Default to -1 indicating no override

    @Schema(
            description =
                    "Override Y coordinate for stamp placement. If set, it will override the position-based calculation. Negative value means no override.",
            example = "-1")
    private float overrideY = -1; // Default to -1 indicating no override

    @Schema(
            description = "Specifies the margin size for the stamp.",
            allowableValues = {"small", "medium", "large", "x-large"},
            defaultValue = "medium")
    private String customMargin = "medium";

    @Schema(description = "The color for stamp", defaultValue = "#d3d3d3")
    private String customColor = "#d3d3d3";
}
