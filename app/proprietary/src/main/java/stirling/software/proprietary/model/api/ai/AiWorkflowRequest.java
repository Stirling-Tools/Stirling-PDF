package stirling.software.proprietary.model.api.ai;

import java.util.ArrayList;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import jakarta.validation.constraints.NotBlank;

import lombok.Data;

@Data
@Schema(description = "Run an AI workflow")
public class AiWorkflowRequest {

    /**
     * Which app surface the chat is mounted in. Lowercase constants because Spring's {@code
     * StringToEnumConverterFactory} matches enum names exactly and this binds via
     * {@code @ModelAttribute} (same reason as {@code ScannerEffectRequest.Quality}).
     *
     * <p>This is a product control, not a security control. {@code processor} must always be a
     * strict subtraction of {@code editor}: it may only narrow the capability set, never widen it,
     * and it must never be the basis of an authorization decision. A forged value can then only
     * ever deny the caller something they already had.
     */
    public enum Surface {
        editor,
        processor
    }

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

    @Schema(description = "IETF language tag the reply should be written in", example = "fr-FR")
    private String locale;

    // Defaulted, so a client that never learned about this field keeps today's behaviour exactly.
    @Schema(
            description =
                    "Which app surface the chat is mounted in. The processor has no file workspace,"
                            + " so document tools and document creation are refused there.",
            example = "processor",
            defaultValue = "editor")
    private Surface surface = Surface.editor;
}
