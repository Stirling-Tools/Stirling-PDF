package stirling.software.SPDF.model.api.filter;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import stirling.software.SPDF.model.api.PDFWithPageNums;

@Data
public class ContainsTextRequest extends PDFWithPageNums {

    @Schema(description = "The text to check for", required = true)
    private String text;
}
