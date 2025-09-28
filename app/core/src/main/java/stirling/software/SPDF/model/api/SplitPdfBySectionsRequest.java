package stirling.software.SPDF.model.api;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.SplitTypes;
import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class SplitPdfBySectionsRequest extends PDFFile {
    @Schema(
            description = "Pages to be split by section",
            defaultValue = "SPLIT_ALL",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String pageNumbers;

    @Schema(
            implementation = SplitTypes.class,
            description =
                    "Modes for page split. Valid values are:\n"
                            + "SPLIT_ALL_EXCEPT_FIRST_AND_LAST: Splits all except the first and the last pages.\n"
                            + "SPLIT_ALL_EXCEPT_FIRST: Splits all except the first page.\n"
                            + "SPLIT_ALL_EXCEPT_LAST: Splits all except the last page.\n"
                            + "SPLIT_ALL: Splits all pages.\n"
                            + "CUSTOM: Custom split.\n")
    private String splitMode;

    @Schema(
            description = "Number of horizontal divisions for each PDF page",
            defaultValue = "0",
            minimum = "0",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private int horizontalDivisions;

    @Schema(
            description = "Number of vertical divisions for each PDF page",
            defaultValue = "1",
            minimum = "0",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private int verticalDivisions;

    @Schema(
            description = "Merge the split documents into a single PDF",
            defaultValue = "true",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean merge;
}
