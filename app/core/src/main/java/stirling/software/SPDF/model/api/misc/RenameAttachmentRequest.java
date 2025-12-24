package stirling.software.SPDF.model.api.misc;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class RenameAttachmentRequest extends PDFFile {

    @Schema(
            description = "The current name of the attachment to rename",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String attachmentName;

    @Schema(
            description = "The new name for the attachment",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String newName;
}
