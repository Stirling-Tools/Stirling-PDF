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

    @Schema(description = "The stamp text", defaultValue = "Stirling Software")
    private String stampText;

    @Schema(description = "The stamp image")
    private MultipartFile stampImage;

    @Schema(
            description = "The selected alphabet of the stamp text",
            allowableValues = {"roman", "arabic", "japanese", "korean", "chinese"},
            defaultValue = "roman")
    private String alphabet = "roman";

    @Schema(
            description = "The font size of the stamp text and image",
            defaultValue = "30",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private float fontSize;

    @Schema(
            description = "The rotation of the stamp in degrees",
            defaultValue = "0",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private float rotation;

    @Schema(
            description = "The opacity of the stamp (0.0 - 1.0)",
            defaultValue = "0.5",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private float opacity;

    @Schema(
            description =
                    "Position for stamp placement based on a 1-9 grid (1: bottom-left, 2: bottom-center,"
                            + " 3: bottom-right, 4: middle-left, 5: middle-center, 6: middle-right,"
                            + " 7: top-left, 8: top-center, 9: top-right)",
            allowableValues = {"1", "2", "3", "4", "5", "6", "7", "8", "9"},
            defaultValue = "5",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private int position;

    @Schema(
            description =
                    "Override X coordinate for stamp placement. If set, it will override the"
                            + " position-based calculation. Negative value means no override.",
            defaultValue = "-1",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private float overrideX; // Default to -1 indicating no override

    @Schema(
            description =
                    "Override Y coordinate for stamp placement. If set, it will override the"
                            + " position-based calculation. Negative value means no override.",
            defaultValue = "-1",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private float overrideY; // Default to -1 indicating no override

    @Schema(
            description = "Specifies the margin size for the stamp.",
            allowableValues = {"small", "medium", "large", "x-large"},
            defaultValue = "medium",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String customMargin;

    @Schema(description = "The color of the stamp text", defaultValue = "#d3d3d3")
    private String customColor;
}
