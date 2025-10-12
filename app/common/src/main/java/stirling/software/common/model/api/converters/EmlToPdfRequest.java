package stirling.software.common.model.api.converters;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;
import lombok.EqualsAndHashCode;

import stirling.software.common.model.api.PDFFile;

@Data
@EqualsAndHashCode(callSuper = true)
public class EmlToPdfRequest extends PDFFile {

    // fileInput is inherited from PDFFile

    @Schema(
            description = "Include email attachments in the PDF output",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "false",
            allowableValues = {"true", "false"},
            example = "false")
    private Boolean includeAttachments = false;

    @Schema(
            description = "Maximum attachment size in MB to include (default 10MB, range: 1-100)",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "10",
            example = "10",
            minimum = "1",
            maximum = "100")
    private int maxAttachmentSizeMB = 10;

    @Schema(
            description = "Download HTML intermediate file instead of PDF",
            requiredMode = Schema.RequiredMode.REQUIRED,
            defaultValue = "false",
            allowableValues = {"true", "false"},
            example = "false")
    private Boolean downloadHtml = false;
}
