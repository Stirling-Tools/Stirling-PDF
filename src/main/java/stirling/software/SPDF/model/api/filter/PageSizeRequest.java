package stirling.software.SPDF.model.api.filter;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import stirling.software.SPDF.model.api.PDFComparison;
import stirling.software.SPDF.model.api.PDFFile;

@Data
public class PageSizeRequest extends PDFComparison {

    @Schema(description = "Standard Page Size", required = true)
    private String standardPageSize;


}
