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
                            + " Common options: http://timestamp.digicert.com (DigiCert),"
                            + " http://timestamp.sectigo.com (Sectigo),"
                            + " http://ts.ssl.com (SSL.com),"
                            + " http://timestamp.entrust.net/TSS/RFC3161sha2TS (Entrust),"
                            + " http://freetsa.org/tsr (FreeTSA).",
            defaultValue = "http://timestamp.digicert.com",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String tsaUrl;
}
