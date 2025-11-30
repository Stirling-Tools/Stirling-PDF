package stirling.software.SPDF.model.api.security;

import java.util.List;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;
import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class MultiSignPDFWithCertRequest extends PDFFile {

    @Schema(
            description = "The list of certificate types for each signer",
            allowableValues = {"PEM", "PKCS12", "PFX", "JKS", "SERVER"},
            requiredMode = Schema.RequiredMode.REQUIRED)
    private List<String> certTypes;

    @Schema(
            description =
                    "Private key files for PEM certificates (supports .pem, .der, or .key files)."
                            + " Should match the order of certTypes when PEM is selected")
    private List<MultipartFile> privateKeyFiles;

    @Schema(
            description =
                    "Certificate files for PEM certificates (supports .pem, .der, .crt, or .cer files)."
                            + " Should match the order of certTypes when PEM is selected")
    private List<MultipartFile> certFiles;

    @Schema(
            description =
                    "PKCS12/PFX keystore files. Should match the order of certTypes when PKCS12 or PFX is selected")
    private List<MultipartFile> p12Files;

    @Schema(description = "JKS keystore files. Should match the order of certTypes when JKS is selected")
    private List<MultipartFile> jksFiles;

    @Schema(description = "Passwords for keystores or private keys", format = "password")
    private List<String> passwords;

    @Schema(description = "Whether to visually show each signature in the PDF")
    private List<Boolean> showSignatures;

    @Schema(description = "Reasons for signing, aligned with certTypes")
    private List<String> reasons;

    @Schema(description = "Locations for signing, aligned with certTypes")
    private List<String> locations;

    @Schema(description = "Signer names, aligned with certTypes")
    private List<String> names;

    @Schema(
            description =
                    "Page numbers for visible signatures (1-indexed). Required when showSignature is true for a signer")
    private List<Integer> pageNumbers;

    @Schema(description = "Whether to show a signature logo for each signer")
    private List<Boolean> showLogos;
}
