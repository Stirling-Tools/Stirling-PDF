package stirling.software.SPDF.model.api.security;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.SPDF.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class AddPasswordRequest extends PDFFile {

    @Schema(
            description =
                    "The owner password to be added to the PDF file (Restricts what can be done"
                            + " with the document once it is opened)",
            format = "password")
    private String ownerPassword;

    @Schema(
            description =
                    "The password to be added to the PDF file (Restricts the opening of the"
                            + " document itself.)",
            format = "password")
    private String password;

    @Schema(
            description = "The length of the encryption key",
            allowableValues = {"40", "128", "256"},
            defaultValue = "256",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private int keyLength = 256;

    @Schema(description = "Whether document assembly is prevented", defaultValue = "false")
    private Boolean preventAssembly;

    @Schema(description = "Whether content extraction is prevented", defaultValue = "false")
    private Boolean preventExtractContent;

    @Schema(
            description = "Whether content extraction for accessibility is prevented",
            defaultValue = "false")
    private Boolean preventExtractForAccessibility;

    @Schema(description = "Whether form filling is prevented", defaultValue = "false")
    private Boolean preventFillInForm;

    @Schema(description = "Whether document modification is prevented", defaultValue = "false")
    private Boolean preventModify;

    @Schema(
            description = "Whether modification of annotations is prevented",
            defaultValue = "false")
    private Boolean preventModifyAnnotations;

    @Schema(description = "Whether printing of the document is prevented", defaultValue = "false")
    private Boolean preventPrinting;

    @Schema(description = "Whether faithful printing is prevented", defaultValue = "false")
    private Boolean preventPrintingFaithful;
}
