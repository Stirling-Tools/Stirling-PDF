package stirling.software.SPDF.model.api;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@EqualsAndHashCode(callSuper = false)
public class SplitPdfByChaptersRequest extends PDFFile {
    @Schema(description = "Whether to include Metadata or not", example = "true")
    private Boolean includeMetadata;

    @Schema(description = "Whether to allow duplicates or not", example = "true")
    private Boolean allowDuplicates;

    @Schema(description = "Maximum bookmark level required", example = "2")
    private Integer bookmarkLevel;
}
