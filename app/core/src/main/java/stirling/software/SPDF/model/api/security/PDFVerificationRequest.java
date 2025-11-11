package stirling.software.SPDF.model.api.security;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class PDFVerificationRequest extends PDFFile {

    @Schema(
            description =
                    "Specific PDF standard to verify against (e.g., '1b', '2a', '3u', 'ua1', 'ua2',"
                            + " 'wtpdf-1.0'). Leave empty to auto-detect and verify all declared"
                            + " standards. The response will include both errors (compliance failures)"
                            + " and warnings (non-critical issues) separately.",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String standard;
}
