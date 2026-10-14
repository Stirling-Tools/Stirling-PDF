package stirling.software.SPDF.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class PdfToPdfARequest extends PDFFile {

    @Schema(
            description =
                    "pdfa, pdfa-2, pdfa-2b = PDF/A-2b (usual choice); pdfa-1 = PDF/A-1b;"
                            + " pdfa-3, pdfa-3b = PDF/A-3b (allows attachments, e.g. e-invoice XML);"
                            + " pdfa-1a/2a/3a also tag, else fall back to level B; pdfx = PDF/X.",
            requiredMode = Schema.RequiredMode.REQUIRED,
            allowableValues = {
                "pdfa", "pdfa-1", "pdfa-2", "pdfa-2b", "pdfa-3", "pdfa-3b", "pdfa-1a", "pdfa-2a",
                "pdfa-3a", "pdfx"
            })
    private String outputFormat;

    @Schema(
            description =
                    "Also declare PDF/UA accessibility alongside PDF/A. Only applies to the level A"
                            + " formats, and the claim is written only if it validates.",
            defaultValue = "false")
    private Boolean pdfUa = false;

    @Schema(
            description =
                    "If true, the conversion will fail if the output is not perfectly compliant")
    private Boolean strict = false;
}
