package stirling.software.common.model.api;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.NoArgsConstructor;
import lombok.ToString;

/**
 * An input PDF plus the password that opens it, for tools that must read or append to the file
 * exactly as uploaded: removing the password first rewrites the file and breaks its signatures.
 */
@Data
@NoArgsConstructor
@EqualsAndHashCode(callSuper = true)
public class PDFFileWithDocumentPassword extends PDFFile {

    @Schema(
            description =
                    "(Optional) password that opens the input PDF when it is encrypted. It only"
                            + " opens the file: the uploaded bytes are used as they are.",
            format = "password",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED)
    @ToString.Exclude
    private String documentPassword;
}
