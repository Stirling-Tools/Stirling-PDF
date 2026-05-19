package stirling.software.SPDF.model.api.security;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class TimestampPdfRequest extends PDFFile {

    @Schema(
            description =
                    "URL of the RFC 3161 Time Stamp Authority (TSA) server."
                            + " Must be one of the built-in presets (DigiCert, Sectigo, SSL.com,"
                            + " FreeTSA, MeSign) or an admin-configured URL in"
                            + " settings.yml (security.timestamp.customTsaUrls)."
                            + " If omitted, the server default is used.",
            defaultValue = "http://timestamp.digicert.com",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    private String tsaUrl;
}
