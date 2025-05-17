package stirling.software.SPDF.model.api;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = false)
public class SplitPdfByChaptersRequest extends PDFFile {
    @Schema(
            description = "Whether to include Metadata or not",
            defaultValue = "true",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean includeMetadata;

    @Schema(
            description = "Whether to allow duplicates or not",
            defaultValue = "true",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean allowDuplicates;

    @Schema(
            description = "Maximum bookmark level required",
            minimum = "0",
            defaultValue = "2",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Integer bookmarkLevel;
}
