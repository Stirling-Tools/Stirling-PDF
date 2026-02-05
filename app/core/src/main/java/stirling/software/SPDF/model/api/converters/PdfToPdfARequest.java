package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class PdfToPdfARequest extends PDFFile {

    @Schema(
            description = "The output format type (PDF/A or PDF/X)",
            requiredMode = Schema.RequiredMode.REQUIRED,
            allowableValues = {"pdfa", "pdfa-1", "pdfa-2", "pdfa-2b", "pdfa-3", "pdfa-3b", "pdfx"})
    private String outputFormat;

    @Schema(
            description =
                    "If true, the conversion will fail if the output is not perfectly compliant")
    private boolean strict;
}
