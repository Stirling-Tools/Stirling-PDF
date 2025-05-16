package stirling.software.SPDF.model.api;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class SplitPdfBySectionsRequest extends PDFFile {
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
