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
            description = "Custom margin: small/medium/large/x-large",
            allowableValues = {"small", "medium", "large", "x-large"},
            defaultValue = "medium",
            requiredMode = RequiredMode.NOT_REQUIRED)
    private String customMargin;

    @Schema(
            description = "Font size for page numbers",
            minimum = "1",
            defaultValue = "12",
            requiredMode = RequiredMode.REQUIRED)
    private float fontSize;

    @Schema(
            description = "Font type for page numbers",
            allowableValues = {"helvetica", "courier", "times"},
            requiredMode = RequiredMode.REQUIRED)
    private String fontType;

    @Schema(
            description =
                    "Position: 1-9 representing positions on the page (1=top-left, 2=top-center,"
                            + " 3=top-right, 4=middle-left, 5=middle-center, 6=middle-right,"
                            + " 7=bottom-left, 8=bottom-center, 9=bottom-right)",
            allowableValues = {"1", "2", "3", "4", "5", "6", "7", "8", "9"},
            defaultValue = "8",
            requiredMode = RequiredMode.REQUIRED)
    private int position;

    @Schema(
            description = "Starting number for page numbering",
            minimum = "1",
            defaultValue = "1",
            requiredMode = RequiredMode.REQUIRED)
    private int startingNumber;

    @Schema(
            description = "Which pages to number (e.g. '1,3-5,7' or 'all')",
            defaultValue = "all",
            requiredMode = RequiredMode.NOT_REQUIRED)
    private String pagesToNumber;

    @Schema(
            description =
                    "Custom text pattern. Available variables: {n}=current page number,"
                            + " {total}=total pages, {filename}=original filename",
            example = "Page {n} of {total}",
            defaultValue = "{n}",
            requiredMode = RequiredMode.NOT_REQUIRED)
    private String customText;
}
