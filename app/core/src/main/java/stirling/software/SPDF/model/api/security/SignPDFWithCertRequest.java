package stirling.software.SPDF.model.api.security;

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
                    "SERVER: this server's own certificate, no file or password. Signer shown is"
                            + " the server's organisation, not the user; self-signed by default, so"
                            + " other PDF readers may show it unverified. PEM needs"
                            + " certFile+privateKeyFile, PKCS12/PFX p12File, JKS jksFile."
                            + " WINDOWS_STORE/MACOS_KEYCHAIN/PKCS11: desktop app only.",
            allowableValues = {
                "SERVER",
                "PEM",
                "PKCS12",
                "PFX",
                "JKS",
                "WINDOWS_STORE",
                "MACOS_KEYCHAIN",
                "PKCS11"
            },
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String certType;

    @Schema(
            description =
                    "Private key for certType PEM, used with certFile: a PEM text file (.pem or"
                            + " .key), unencrypted or password-protected.")
    private MultipartFile privateKeyFile;

    @Schema(
            description =
                    "Certificate for certType PEM, used with privateKeyFile (.pem, .crt, .cer or"
                            + " .der).")
    private MultipartFile certFile;

    @Schema(description = "PKCS#12 keystore for certType PKCS12 or PFX (.p12 or .pfx).")
    private MultipartFile p12File;

    @Schema(description = "Java KeyStore for certType JKS (.jks).")
    private MultipartFile jksFile;

    @Schema(
            description =
                    "Password for the PKCS12/PFX or JKS keystore or an encrypted PEM key, or the"
                            + " PKCS11 token PIN. Leave empty if the key has none. Not needed for"
                            + " SERVER, WINDOWS_STORE or MACOS_KEYCHAIN.",
            format = "password")
    private String password;

    @Schema(
            description =
                    "The alias of the certificate to sign with. Required for WINDOWS_STORE and"
                            + " MACOS_KEYCHAIN, and"
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
            description =
                    "Add a visible signature box on pageNumber showing the certificate's name, the"
                            + " date and the reason (if set).",
            defaultValue = "false",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean showSignature = false;

    @Schema(
            description = "The reason for signing the PDF. Omitted from the signature when not set",
            example = "Signed by SPDF")
    private String reason;

    @Schema(
            description =
                    "The location where the PDF is signed. Omitted from the signature when not set",
            example = "SPDF")
    private String location;

    @Schema(
            description =
                    "Signer name stored in the signature properties; the visible box shows the"
                            + " certificate's name instead. Omitted when not set.",
            example = "SPDF")
    private String name;

    @Schema(
            description =
                    "Page (1-based) for the visible signature. Only used when showSignature is"
                            + " true and fieldName is not set.",
            defaultValue = "1")
    private Integer pageNumber = 1;

    @Schema(
            description =
                    "Left edge of the visible signature box in PDF points, in the page's own"
                            + " coordinate space (origin bottom-left, before page rotation, crop"
                            + " box offset included). Give x, y, width and height together; when"
                            + " all are omitted the box sits 36pt in from the bottom-right corner"
                            + " of the visible page. The box must lie inside the page's crop box.")
    private Float x;

    @Schema(description = "Bottom edge of the visible signature box in PDF points; see x.")
    private Float y;

    @Schema(description = "Width of the visible signature box in PDF points; see x.")
    private Float width;

    @Schema(description = "Height of the visible signature box in PDF points; see x.")
    private Float height;

    @Schema(
            description =
                    "Fully qualified name of an empty signature field to sign into. The"
                            + " signature takes that field's page and box: pageNumber is ignored"
                            + " and x/y/width/height must be left out. Needs showSignature."
                            + " Rejected when the field does not exist or is already signed.")
    private String fieldName;

    @Schema(
            description = "Whether to visually show a signature logo along with the signature",
            defaultValue = "true",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean showLogo = true;
}
