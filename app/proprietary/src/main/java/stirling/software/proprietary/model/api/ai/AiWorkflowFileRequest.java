package stirling.software.proprietary.model.api.ai;

import java.util.ArrayList;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

@Data
@Schema(description = "Per-file content extraction request from the AI engine")
public class AiWorkflowFileRequest {

    @Schema(description = "The file the engine wants content extracted for")
    private AiFile file;

    @Schema(description = "Specific 1-based page numbers to extract from this file")
    private List<Integer> pageNumbers = new ArrayList<>();

    @Schema(description = "Content types to extract from this file")
    private List<AiPdfContentType> contentTypes = new ArrayList<>();
}
