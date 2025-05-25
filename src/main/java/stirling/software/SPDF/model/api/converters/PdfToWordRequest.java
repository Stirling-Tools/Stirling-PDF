package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class PdfToWordRequest extends PDFFile {

    @Schema(
            description = "The output Word document format",
            requiredMode = Schema.RequiredMode.REQUIRED,
            allowableValues = {"doc", "docx", "odt"})
    private String outputFormat;
}
