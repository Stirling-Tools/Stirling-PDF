package stirling.software.SPDF.model.api.security;

import java.util.List;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class SignPDFWithCertRequest extends PDFFile {

    @Schema(
            description =
                    "The type of the digital certificate. WINDOWS_STORE and PKCS11 are"
                            + " hardware-backed and only available in the desktop app.",
            allowableValues = {"PEM", "PKCS12", "PFX", "JKS", "SERVER", "WINDOWS_STORE", "PKCS11"},
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String certType;

    @Schema(
            description =
                    "The private key for the digital certificate (required for PEM type"
                            + " certificates, supports .pem, .der, or .key files)")
    private MultipartFile privateKeyFile;

    @Schema(
            description =
                    "The digital certificate (required for PEM type certificates, supports"
                            + " .pem, .der, .crt, or .cer files)")
    private MultipartFile certFile;

    @Schema(
            description =
                    "The PKCS12/PFX keystore file (required for PKCS12 or PFX type certificates)")
    private MultipartFile p12File;

    @Schema(description = "The JKS keystore file (Java Key Store)")
    private MultipartFile jksFile;

    @Schema(
            description =
                    "The password for the keystore / private key, or the token PIN for PKCS11",
            format = "password")
    private String password;

    @Schema(
            description =
                    "The alias of the certificate to sign with. Required for WINDOWS_STORE and"
                            + " recommended for PKCS11 tokens holding multiple certificates.")
    private String alias;

    @Schema(
            description =
                    "Absolute path to the PKCS#11 driver library (required for PKCS11 type). Must"
                            + " be an allowed driver - a detected one or configured via"
                            + " STIRLING_PKCS11_LIBRARIES.")
    private String pkcs11LibraryPath;

    @Schema(
            description =
                    "Optional PKCS#11 slot index. When omitted the first slot with a token is"
                            + " used.")
    private Integer pkcs11Slot;

    @Schema(
            description = "Whether to visually show the signature in the PDF file",
            defaultValue = "false",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean showSignature;

    @Schema(description = "The reason for signing the PDF", defaultValue = "Signed by SPDF")
    private String reason;

    @Schema(description = "The location where the PDF is signed", defaultValue = "SPDF")
    private String location;

    @Schema(description = "The name of the signer", defaultValue = "SPDF")
    private String name;

    @Schema(
            description =
                    "The page number where the signature should be visible. This is required if"
                            + " showSignature is set to true",
            defaultValue = "1")
    private Integer pageNumber;

    @Schema(
            description = "Whether to visually show a signature logo along with the signature",
            defaultValue = "true",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean showLogo;

    @Schema(
            description =
                    "Image drawn inside the signature box when showLogo is set, typically the"
                            + " signer's organisation logo. PNG or JPEG. Omit to keep the bundled"
                            + " mark.")
    private MultipartFile logoImage;

    @Schema(
            description =
                    "Where the logo sits inside the signature box. BEHIND draws it under the text"
                            + " as a watermark; the others give it a strip of its own. Ignored"
                            + " unless a signature box is requested.",
            defaultValue = "LEFT")
    private SignatureLogoPosition logoPosition;

    @Schema(
            description =
                    "Distance in PDF points from the left edge of the page to the left edge of the"
                            + " signature box. Omit to keep the legacy bottom-left placement.")
    private Float signatureX;

    @Schema(
            description =
                    "Distance in PDF points from the bottom edge of the page to the bottom edge of"
                            + " the signature box. PDF user space, same convention as the crop"
                            + " endpoint: the origin is the bottom-left corner and y grows"
                            + " upwards.")
    private Float signatureY;

    @Schema(description = "Width of the signature box in PDF points.", defaultValue = "200")
    private Float signatureWidth;

    @Schema(description = "Height of the signature box in PDF points.", defaultValue = "50")
    private Float signatureHeight;

    @Schema(
            description =
                    "Certificate fields to draw inside the signature box, in the order given. Omit"
                            + " to keep the legacy content (signer name, date and reason). Fields"
                            + " the certificate does not carry are skipped rather than drawn"
                            + " blank.")
    private List<CertificateAttribute> visibleAttributes;

    @Schema(
            description =
                    "Repeat the signature's appearance on every page. A PDF signature has one"
                            + " widget on one page, so only the page given by pageNumber carries"
                            + " the actual signature; the other pages get a visual mark with the"
                            + " same content that is NOT a signature. Tell the user that, or the"
                            + " document looks signed in more places than it is.",
            defaultValue = "false")
    private Boolean markAllPages;
}
