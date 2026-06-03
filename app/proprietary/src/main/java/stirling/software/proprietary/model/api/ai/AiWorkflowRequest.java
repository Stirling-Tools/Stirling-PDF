package stirling.software.proprietary.model.api.ai;

import java.util.ArrayList;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import lombok.Data;

@Data
@Schema(description = "Run an AI workflow")
public class AiWorkflowRequest {

    @NotNull
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

    @Pattern(regexp = "^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]{1,30}$")
    @Schema(
            description =
                    "Optional document style: accent/heading colour (CSS colour value, e.g. '#1e3a5f')")
    private String documentStylePrimaryColor;

    @Pattern(regexp = "^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]{1,30}$")
    @Schema(
            description =
                    "Optional document style: page background colour (CSS colour value, e.g. '#ffffff')")
    private String documentStyleBackgroundColor;

    @Pattern(regexp = "^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]{1,30}$")
    @Schema(
            description =
                    "Optional document style: body text colour (auto-set for dark backgrounds)")
    private String documentStyleBodyTextColor;
}
