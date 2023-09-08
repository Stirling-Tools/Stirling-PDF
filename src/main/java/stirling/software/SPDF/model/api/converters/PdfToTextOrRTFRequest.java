package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import stirling.software.SPDF.model.api.PDFFile;

@Data
public class PdfToTextOrRTFRequest extends PDFFile {

    @Schema(description = "The output Text or RTF format", allowableValues = {"rtf", "txt:Text"})
    private String outputFormat;
}
