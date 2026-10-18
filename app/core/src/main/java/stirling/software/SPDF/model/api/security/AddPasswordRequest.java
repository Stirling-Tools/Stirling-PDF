package stirling.software.SPDF.model.api.security;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class AddPasswordRequest extends PDFFile {

    @Schema(
            description =
                    "Password needed to change the prevent* restrictions. Must differ from"
                            + " password for them to hold.",
            format = "password")
    private String ownerPassword;

    @Schema(
            description = "Password needed to open the PDF. Leave empty to only add restrictions.",
            format = "password")
    private String password;

    @Schema(
            description = "The length of the encryption key",
            type = "integer",
            allowableValues = {"40", "128", "256"},
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            defaultValue = "256")
    private int keyLength = 256;

    @Schema(description = "Whether document assembly is prevented", defaultValue = "false")
    private Boolean preventAssembly = false;

    @Schema(description = "Whether content extraction is prevented", defaultValue = "false")
    private Boolean preventExtractContent = false;

    @Schema(
            description = "Whether content extraction for accessibility is prevented",
            defaultValue = "false")
    private Boolean preventExtractForAccessibility = false;

    @Schema(description = "Whether form filling is prevented", defaultValue = "false")
    private Boolean preventFillInForm = false;

    @Schema(description = "Whether document modification is prevented", defaultValue = "false")
    private Boolean preventModify = false;

    @Schema(
            description = "Whether modification of annotations is prevented",
            defaultValue = "false")
    private Boolean preventModifyAnnotations = false;

    @Schema(description = "Whether printing of the document is prevented", defaultValue = "false")
    private Boolean preventPrinting = false;

    @Schema(description = "Whether faithful printing is prevented", defaultValue = "false")
    private Boolean preventPrintingFaithful = false;
}
