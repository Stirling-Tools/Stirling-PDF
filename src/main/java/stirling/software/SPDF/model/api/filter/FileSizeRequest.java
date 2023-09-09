package stirling.software.SPDF.model.api.filter;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import stirling.software.SPDF.model.api.PDFComparison;
import stirling.software.SPDF.model.api.PDFFile;

@Data
public class FileSizeRequest extends PDFComparison {

    @Schema(description = "File Size", required = true)
    private String fileSize;


}
