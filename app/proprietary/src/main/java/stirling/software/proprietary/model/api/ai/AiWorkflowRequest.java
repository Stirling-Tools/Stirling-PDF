package stirling.software.proprietary.model.api.ai;

import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import lombok.Data;

@Data
@Schema(description = "Run an AI workflow against one or more PDF files")
public class AiWorkflowRequest {

    @NotNull
    @NotEmpty
    @Schema(description = "The input PDF files")
    private List<AiWorkflowFileInput> fileInputs;

    @NotBlank
    @Schema(description = "The user message to orchestrate", example = "Summarise these documents")
    private String userMessage;
}
