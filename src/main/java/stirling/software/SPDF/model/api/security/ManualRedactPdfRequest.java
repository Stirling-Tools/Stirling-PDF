package stirling.software.SPDF.model.api.security;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;
import stirling.software.SPDF.model.api.PDFWithPageNums;

@Data
@EqualsAndHashCode(callSuper = true)
public class ManualRedactPdfRequest extends PDFWithPageNums {
    private List<RedactionArea> redactions;

    @Schema(description = "Convert the redacted PDF to an image", defaultValue = "false")
    private boolean convertPDFToImage;

    private String pageRedactionColor;
}
