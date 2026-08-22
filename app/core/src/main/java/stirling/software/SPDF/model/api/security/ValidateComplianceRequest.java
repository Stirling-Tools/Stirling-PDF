package stirling.software.SPDF.model.api.security;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class ValidateComplianceRequest extends PDFFile {

    @Schema(
            description =
                    "Standard to validate against: auto (whatever the document declares), pdfa or"
                            + " pdfua",
            allowableValues = {"auto", "pdfa", "pdfua"},
            defaultValue = "auto")
    private String standard;

    @Schema(
            description =
                    "What to do when the document is not compliant: fail stops the run, warn logs"
                            + " and continues",
            allowableValues = {"fail", "warn"},
            defaultValue = "fail")
    private String onViolation;
}
