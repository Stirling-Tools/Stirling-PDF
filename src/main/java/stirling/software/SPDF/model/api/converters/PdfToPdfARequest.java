package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class PdfToPdfARequest extends PDFFile {

    @Schema(
            description = "The output PDF/A type",
            requiredMode = Schema.RequiredMode.REQUIRED,
            allowableValues = {"pdfa", "pdfa-1"})
    private String outputFormat;
}
