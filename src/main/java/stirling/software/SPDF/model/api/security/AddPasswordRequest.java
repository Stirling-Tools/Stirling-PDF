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
                    "The owner password to be added to the PDF file (Restricts what can be done with the document once it is opened)",
            defaultValue = "")
    private String ownerPassword;

    @Schema(
            description =
                    "The password to be added to the PDF file (Restricts the opening of the document itself.)",
            defaultValue = "")
    private String password;

    @Schema(
            description = "The length of the encryption key",
            allowableValues = {"40", "128", "256"},
            defaultValue = "256")
    private int keyLength = 256;

    @Schema(description = "Whether the document assembly is allowed", example = "false")
    private boolean canAssembleDocument;

    @Schema(
            description = "Whether content extraction for accessibility is allowed",
            example = "false")
    private boolean canExtractContent;

    @Schema(
            description = "Whether content extraction for accessibility is allowed",
            example = "false")
    private boolean canExtractForAccessibility;

    @Schema(description = "Whether form filling is allowed", example = "false")
    private boolean canFillInForm;

    @Schema(description = "Whether the document modification is allowed", example = "false")
    private boolean canModify;

    @Schema(description = "Whether modification of annotations is allowed", example = "false")
    private boolean canModifyAnnotations;

    @Schema(description = "Whether printing of the document is allowed", example = "false")
    private boolean canPrint;

    @Schema(description = "Whether faithful printing is allowed", example = "false")
    private boolean canPrintFaithful;
}
