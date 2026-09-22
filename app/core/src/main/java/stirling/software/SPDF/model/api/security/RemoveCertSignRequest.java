package stirling.software.SPDF.model.api.security;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class RemoveCertSignRequest extends PDFFile {

    @Schema(
            description =
                    "Also remove the visible appearance of certificate signature fields. Does not"
                            + " remove signatures embedded in page content or scanned images.",
            defaultValue = "false")
    private boolean removeVisibleSignature = false;
}
