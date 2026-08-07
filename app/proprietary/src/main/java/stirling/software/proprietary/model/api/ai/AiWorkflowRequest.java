package stirling.software.proprietary.model.api.ai;

import java.util.ArrayList;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotBlank;

import lombok.Data;

@Data
@Schema(description = "Run an AI workflow")
public class AiWorkflowRequest {

    @Schema(description = "The input PDF files")
    private List<AiWorkflowFileInput> fileInputs = new ArrayList<>();

    @NotBlank
    @Schema(description = "The user message to orchestrate", example = "Summarise these documents")
    private String userMessage;

    @Schema(
            description =
                    "Prior chat messages exchanged between the user and the assistant, ordered"
                            + " oldest-first. Excludes the current userMessage.")
    private List<AiConversationMessage> conversationHistory = new ArrayList<>();
}
