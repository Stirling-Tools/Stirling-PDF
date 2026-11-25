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
                    "MACOS_KEYCHAIN only: refuse unless the alias's key is on a smart card or"
                            + " security key. Set it when the ID the user picked was on one, so"
                            + " signing fails instead of using a copy of the same certificate in"
                            + " the login keychain once the token is removed.")
    private Boolean requireToken;

    @Schema(
            description =
                    "SHA-256 fingerprint (hex) of the certificate the user reviewed, from the"
                            + " certificate listing or the server-certificate endpoint. Signing is"
                            + " refused when the certificate that would sign differs.")
    private String expectedCertificateSha256;

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
            description = "Older name for showWatermark, used when showWatermark is not set.",
            defaultValue = "true",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private Boolean showLogo = true;

    @Schema(
            description =
                    "What fills the half beside the visible signature's details: NAME (the certificate's name in large type, the"
                            + " default), IMAGE (signatureImage, such as a handwritten signature)"
                            + " or NONE (the details alone fill the box).",
            allowableValues = {"NAME", "IMAGE", "NONE"})
    private String stampGraphic;

    @Schema(
            description =
                    "PNG or JPEG drawn beside the details when stampGraphic is IMAGE, up to 2 MB"
                            + " and 4096 pixels on a side.",
            format = "binary")
    private MultipartFile signatureImage;

    @Schema(
            description =
                    "Draw the signature logo faded behind the whole visible signature: the"
                            + " organisation's when an admin has uploaded one, else the Stirling"
                            + " PDF logo. Defaults to showLogo.")
    private Boolean showWatermark;

    @Schema(
            description =
                    "IANA time zone the visible signature's date is written in, as in"
                            + " 2026.11.24 10:12:00 +01'00'. Defaults to the server's.",
            example = "Europe/Berlin")
    private String timeZone;

    @Schema(
            description =
                    "The visible signature's first detail line, with {name} exactly once where"
                            + " the certificate's name goes. Defaults to \"Digitally signed by"
                            + " {name}\".",
            example = "Digital signiert von {name}")
    private String signedByLabel;

    @Schema(
            description = "Label before the date on the visible signature. Defaults to \"Date:\".",
            example = "Datum:")
    private String dateLabel;

    @Schema(
            description =
                    "Label before the reason on the visible signature. Defaults to \"Reason:\".",
            example = "Grund:")
    private String reasonLabel;

    @Schema(
            description =
                    "Label before the location on the visible signature. Defaults to"
                            + " \"Location:\".",
            example = "Ort:")
    private String locationLabel;
}
