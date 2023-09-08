package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import stirling.software.SPDF.model.api.PDFFile;

@Data
public class PdfToWordRequest extends PDFFile {

    @Schema(description = "The output Word document format", allowableValues = {"doc", "docx", "odt"})
    private String outputFormat;
}
