package stirling.software.SPDF.model.api.misc;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFWithPageNums;

/** Optional fields default to what the add-stamp tool in the web UI sends. */
@Data
@EqualsAndHashCode(callSuper = true)
public class AddStampRequest extends PDFWithPageNums {

    @Schema(
            description =
                    "The stamp type (text or image). When omitted, image is used if stampImage is"
                            + " supplied, otherwise text.",
            allowableValues = {"text", "image"})
    private String stampType;

    @Schema(
            description =
                    "The stamp text, required when stampType is text. \\n starts a new"
                            + " line. Supports @page, @total_pages, @date, @date{dd/MM/yyyy}, @time,"
                            + " @filename, @title, @author and @uuid (@@ for a literal @).")
    private String stampText;

    @Schema(description = "The stamp image, required when stampType is image")
    private MultipartFile stampImage;

    @Schema(
            description =
                    "Where to place the stamp on a 3x3 grid: 1=top-left, 2=top-center,"
                            + " 3=top-right, 4=middle-left, 5=center, 6=middle-right,"
                            + " 7=bottom-left, 8=bottom-center, 9=bottom-right",
            allowableValues = {"1", "2", "3", "4", "5", "6", "7", "8", "9"},
            defaultValue = "5")
    private int position = 5;

    @Schema(
            description = "Text size in points; for an image stamp, the image height",
            defaultValue = "40")
    private float fontSize = 40f;

    @Schema(description = "The opacity of the stamp (0.0 - 1.0)", defaultValue = "0.5")
    private float opacity = 0.5f;

    @Schema(description = "Hex colour of the stamp text, e.g. #FF0000", defaultValue = "#d3d3d3")
    private String customColor = "#d3d3d3";

    @Schema(description = "The rotation of the stamp in degrees", defaultValue = "0")
    private float rotation = 0f;

    @Schema(
            description = "Font script matching stampText",
            allowableValues = {"roman", "arabic", "japanese", "korean", "chinese", "thai"},
            defaultValue = "roman")
    private String alphabet = "roman";

    @Schema(
            description =
                    "X in points from the left edge; with overrideY, replaces position. -1"
                            + " = not set.",
            defaultValue = "-1")
    private float overrideX = -1f;

    @Schema(
            description =
                    "Y in points from the bottom edge; with overrideX, replaces position."
                            + " -1 = not set.",
            defaultValue = "-1")
    private float overrideY = -1f;

    @Schema(
            description = "Margin between the stamp and the page edge when placed by position",
            allowableValues = {"small", "medium", "large", "x-large"},
            defaultValue = "medium")
    private String customMargin = "medium";
}
