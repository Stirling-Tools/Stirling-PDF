package stirling.software.SPDF.model.api.misc;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class DeleteAttachmentRequest extends PDFFile {

    @Schema(
            description = "The name of the attachment to delete",
            example = "stirling-pdf.txt",
            format = "string",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String attachmentName;
}
