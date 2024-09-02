package stirling.software.SPDF.model.api;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class PDFWithPageSize extends PDFFile {

    @Schema(
            description =
                    "The scale of pages in the output PDF. Acceptable values are A0-A6, LETTER, LEGAL.",
            allowableValues = {"A0", "A1", "A2", "A3", "A4", "A5", "A6", "LETTER", "LEGAL"})
    private String pageSize;
}
