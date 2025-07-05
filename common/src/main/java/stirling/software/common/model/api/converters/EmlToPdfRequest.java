package stirling.software.common.model.api.converters;

import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotNull;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode
public class EmlToPdfRequest {

    @Schema(
            description = "The input EML email file",
            format = "binary",
            requiredMode = Schema.RequiredMode.REQUIRED)
    @NotNull(message = "EML file is required")
    private MultipartFile fileInput;

    @Schema(
            description = "Include email attachments in the PDF output",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            example = "false")
    private boolean includeAttachments = false;

    @Schema(
            description = "Maximum attachment size in MB to include (default 10MB, range: 1-100)",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            example = "10",
            minimum = "1",
            maximum = "100")
    private int maxAttachmentSizeMB = 10;

    @Schema(
            description = "Download HTML intermediate file instead of PDF",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            example = "false")
    private boolean downloadHtml = false;

    @Schema(
            description = "Include CC and BCC recipients in header (if available)",
            requiredMode = Schema.RequiredMode.NOT_REQUIRED,
            example = "true")
    private boolean includeAllRecipients = true;
}
