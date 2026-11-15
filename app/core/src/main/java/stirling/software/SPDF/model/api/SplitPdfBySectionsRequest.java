package stirling.software.SPDF.model.api;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.SplitTypes;
import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class SplitPdfBySectionsRequest extends PDFFile {
    @Schema(
            description =
                    "Pages to split when splitMode is CUSTOM (required in that mode, ignored"
                            + " otherwise). Supports ranges (e.g. '1,3,5-9'), 'all', or functions"
                            + " like '2n+1'.",
            example = "1,3,5-9",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String pageNumbers;

    @Schema(
            implementation = SplitTypes.class,
            description =
                    "Which pages to split (default SPLIT_ALL). SPLIT_ALL splits every page;"
                            + " SPLIT_ALL_EXCEPT_FIRST, SPLIT_ALL_EXCEPT_LAST and"
                            + " SPLIT_ALL_EXCEPT_FIRST_AND_LAST keep those pages whole; CUSTOM"
                            + " splits only pageNumbers.")
    private String splitMode;

    @Schema(
            description = "Number of horizontal divisions for each PDF page",
            defaultValue = "0",
            minimum = "0",
            requiredMode = Schema.RequiredMode.REQUIRED)
    @Min(value = 0, message = "Horizontal divisions must be non-negative")
    @Max(value = 50, message = "Horizontal divisions must not exceed 50")
    private int horizontalDivisions;

    @Schema(
            description = "Number of vertical divisions for each PDF page",
            defaultValue = "1",
            minimum = "0",
            requiredMode = Schema.RequiredMode.REQUIRED)
    @Min(value = 0, message = "Vertical divisions must be non-negative")
    @Max(value = 50, message = "Vertical divisions must not exceed 50")
    private int verticalDivisions = 1;

    @Schema(
            description = "Merge the split documents into a single PDF",
            defaultValue = "false",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean merge = false;
}
