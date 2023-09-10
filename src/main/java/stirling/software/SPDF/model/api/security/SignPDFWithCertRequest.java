package stirling.software.SPDF.model.api.security;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import org.springframework.web.multipart.MultipartFile;
import stirling.software.SPDF.model.api.PDFFile;

@Data
public class SignPDFWithCertRequest extends PDFFile {

    @Schema(description = "The type of the digital certificate", allowableValues = { "PKCS12", "PEM" })
    private String certType;

    @Schema(description = "The private key for the digital certificate (required for PEM type certificates)")
    private MultipartFile privateKeyFile;

    @Schema(description = "The digital certificate (required for PEM type certificates)")
    private MultipartFile certFile;

    @Schema(description = "The PKCS12 keystore file (required for PKCS12 type certificates)")
    private MultipartFile p12File;

    @Schema(description = "The password for the keystore or the private key")
    private String password;

    @Schema(description = "Whether to visually show the signature in the PDF file")
    private Boolean showSignature;

    @Schema(description = "The reason for signing the PDF")
    private String reason;

    @Schema(description = "The location where the PDF is signed")
    private String location;

    @Schema(description = "The name of the signer")
    private String name;

    @Schema(description = "The page number where the signature should be visible. This is required if showSignature is set to true")
    private Integer pageNumber;
}
