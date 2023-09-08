package stirling.software.SPDF.model.api.general;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import org.springframework.web.multipart.MultipartFile;
import stirling.software.SPDF.model.api.PDFFile;

@Data
public class ScalePagesRequest extends PDFFile {

    @Schema(description = "The scale of pages in the output PDF. Acceptable values are A0-A10, B0-B9, LETTER, TABLOID, LEDGER, LEGAL, EXECUTIVE.", 
           allowableValues = {
                    "A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10", "B0", "B1", "B2", "B3", "B4",
                    "B5", "B6", "B7", "B8", "B9", "LETTER", "TABLOID", "LEDGER", "LEGAL", "EXECUTIVE"
           })
    private String targetPDRectangle;

    @Schema(description = "The scale of the content on the pages of the output PDF. Acceptable values are floats.")
    private float scaleFactor;
}
