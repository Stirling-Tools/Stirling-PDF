package stirling.software.SPDF.model.api.extract;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class PDFFilePage extends PDFFile {

    @Schema(description = "Number of chosen page", type = "number")
    private int pageId;
}
