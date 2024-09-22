package stirling.software.SPDF.model.api.converters;

import stirling.software.SPDF.model.api.PDFFile;


import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;
import  stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class PdfToMarkdownRequest extends PDFFile {
    @Schema(
            description = "The output Markdown format",
            allowableValues = {"md"})
    private String outputFormat = "md";
}
