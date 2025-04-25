package stirling.software.SPDF.model.api;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class PDFComparisonAndCount extends PDFComparison {
    @Schema(description = "Count")
    private String pageCount;
}
