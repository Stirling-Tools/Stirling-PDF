package stirling.software.proprietary.model.api.ai;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

@Data
@Schema(description = "Page-scoped extracted text selection")
public class AiWorkflowTextSelection {

    @Schema(description = "1-based page number", example = "2")
    private Integer pageNumber;

    @Schema(description = "Extracted text or evidence snippet")
    private String text;
}
