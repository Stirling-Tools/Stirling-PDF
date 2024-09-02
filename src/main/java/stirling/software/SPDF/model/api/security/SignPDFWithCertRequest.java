package stirling.software.SPDF.model.api.security;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class SignPDFWithCertRequest extends PDFFile {

    @Schema(
            description = "The type of the digital certificate",
            allowableValues = {"PEM", "PKCS12", "JKS"})
    private String certType;

    @Schema(
            description =
                    "The private key for the digital certificate (required for PEM type certificates)")
    private MultipartFile privateKeyFile;

    @Schema(description = "The digital certificate (required for PEM type certificates)")
    private MultipartFile certFile;

    @Schema(description = "The PKCS12 keystore file (required for PKCS12 type certificates)")
    private MultipartFile p12File;

    @Schema(description = "The JKS keystore file (Java Key Store)")
    private MultipartFile jksFile;

    @Schema(description = "The password for the keystore or the private key")
    private String password;

    @Schema(description = "Whether to visually show the signature in the PDF file")
    private boolean showSignature;

    @Schema(description = "The reason for signing the PDF")
    private String reason;

    @Schema(description = "The location where the PDF is signed")
    private String location;

    @Schema(description = "The name of the signer")
    private String name;

    @Schema(
            description =
                    "The page number where the signature should be visible. This is required if showSignature is set to true")
    private Integer pageNumber;
}
