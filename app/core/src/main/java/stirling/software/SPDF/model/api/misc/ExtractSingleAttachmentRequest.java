package stirling.software.SPDF.model.api.misc;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class ExtractSingleAttachmentRequest extends PDFFile {
    @Schema(
            description = "Name of the embedded attachment to extract",
            requiredMode = Schema.RequiredMode.REQUIRED)
    private String attachmentName;
}
