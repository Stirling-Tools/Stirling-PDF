package stirling.software.proprietary.model.api.ai;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** A single file produced by a completed AI workflow. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "Descriptor for a file produced by an AI workflow")
public class AiWorkflowResultFile {

    @Schema(description = "Stirling file ID — download with GET /api/v1/general/files/{fileId}")
    private String fileId;

    @Schema(description = "Original filename for the file")
    private String fileName;

    @Schema(description = "MIME type of the file", example = "application/pdf")
    private String contentType;
}
