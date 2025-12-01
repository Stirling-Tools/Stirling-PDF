package stirling.software.SPDF.model.api.security;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

@Data
public class ParticipantCertificateRequest {

    @Schema(
            description = "Certificate type for the participant",
            allowableValues = {"PEM", "PKCS12", "PFX", "JKS", "SERVER"},
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String certType;

    @Schema(description = "Password for keystore or private key", format = "password")
    private String password;

    @Schema(description = "Private key for PEM flow")
    private MultipartFile privateKeyFile;

    @Schema(description = "Certificate for PEM flow")
    private MultipartFile certFile;

    @Schema(description = "PKCS12/PFX keystore")
    private MultipartFile p12File;

    @Schema(description = "JKS keystore")
    private MultipartFile jksFile;

    @Schema(description = "Display the signature visually")
    private Boolean showSignature;

    @Schema(description = "Page number for visible signature (1-indexed)")
    private Integer pageNumber;

    @Schema(description = "Custom signer name override")
    private String name;

    @Schema(description = "Signing reason")
    private String reason;

    @Schema(description = "Signing location")
    private String location;

    @Schema(description = "Show the Stirling PDF logo in the appearance")
    private Boolean showLogo;
}
