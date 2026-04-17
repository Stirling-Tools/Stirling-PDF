package stirling.software.proprietary.model.api.ai;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import lombok.Data;

@Data
@Schema(description = "A prior message in the chat conversation")
public class AiConversationMessage {

    @NotNull
    @NotBlank
    @Schema(description = "The role of the message sender", example = "user")
    private String role;

    @NotNull
    @Schema(description = "The content of the message")
    private String content;
}
