package stirling.software.SPDF.model.api.misc;

import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Schema.RequiredMode;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFWithPageNums;

@Data
@EqualsAndHashCode(callSuper = true)
public class AddPageNumbersRequest extends PDFWithPageNums {

    @Schema(
            description = "Font type for page numbers",
            allowableValues = {"helvetica", "courier", "times"},
            requiredMode = RequiredMode.REQUIRED)
    private String fontType;

    @Schema(
            description =
                    "Where to place the number on a 3x3 grid: 1=top-left, 2=top-center,"
                            + " 3=top-right, 4=middle-left, 5=center, 6=middle-right,"
                            + " 7=bottom-left, 8=bottom-center, 9=bottom-right",
            type = "integer",
            allowableValues = {"1", "2", "3", "4", "5", "6", "7", "8", "9"},
            defaultValue = "8",
            requiredMode = RequiredMode.REQUIRED)
    private int position = 8;

    @Schema(
            description =
                    "Text drawn on each numbered page, e.g. 'Page {n} of {total}'. {n}=page"
                            + " number (from startingNumber, counting numbered pages only),"
                            + " {total}=pages in the document, {filename}=file name without"
                            + " extension.",
            example = "Page {n} of {total}",
            defaultValue = "{n}",
            requiredMode = RequiredMode.NOT_REQUIRED)
    private String customText = "{n}";

    @Schema(
            description =
                    "Which pages to number (e.g. '1,3-5,7' or 'all'). Other pages get no number"
                            + " and are not counted by {n}.",
            defaultValue = "all",
            requiredMode = RequiredMode.NOT_REQUIRED)
    private String pagesToNumber = "all";

    @Schema(
            description = "Starting number for page numbering",
            minimum = "1",
            defaultValue = "1",
            requiredMode = RequiredMode.NOT_REQUIRED)
    private int startingNumber = 1;

    @Schema(
            description = "Font size for page numbers",
            minimum = "1",
            defaultValue = "12",
            requiredMode = RequiredMode.NOT_REQUIRED)
    private float fontSize = 12;

    @Schema(
            description = "Hex colour for page numbers (e.g. #FF0000)",
            example = "#000000",
            defaultValue = "#000000",
            requiredMode = RequiredMode.NOT_REQUIRED)
    private String fontColor = "#000000";

    @Schema(
            description = "Custom margin: small/medium/large/x-large",
            allowableValues = {"small", "medium", "large", "x-large"},
            defaultValue = "medium",
            requiredMode = RequiredMode.NOT_REQUIRED)
    private String customMargin = "medium";

    @Schema(
            description =
                    "Zero-padding width for page numbers (Bates Stamping). Set to 0 to disable padding",
            minimum = "0",
            defaultValue = "0",
            requiredMode = RequiredMode.NOT_REQUIRED)
    private int zeroPad = 0;
}
