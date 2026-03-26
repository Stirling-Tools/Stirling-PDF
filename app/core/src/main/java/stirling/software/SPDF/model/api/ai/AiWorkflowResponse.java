package stirling.software.SPDF.model.api.ai;

import java.util.ArrayList;
import java.util.List;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

@Data
@Schema(description = "Structured AI workflow result")
public class AiWorkflowResponse {

    @Schema(description = "Workflow outcome")
    private String outcome;

    @Schema(description = "Answer returned by the AI workflow when applicable")
    private String answer;

    @Schema(description = "Summary returned by the AI workflow when applicable")
    private String summary;

    @Schema(description = "Rationale returned by the AI workflow when applicable")
    private String rationale;

    @Schema(description = "Reason when the AI workflow cannot proceed")
    private String reason;

    @Schema(description = "Clarification question for the user when more input is required")
    private String question;

    @Schema(
            description =
                    "Unsupported capability identifier when the workflow cannot route the request")
    private String capability;

    @Schema(description = "Message returned for unsupported capability outcomes")
    private String message;

    @Schema(description = "Supporting evidence snippets from extracted PDF text")
    private List<AiWorkflowTextSelection> evidence = new ArrayList<>();

    @Schema(description = "Structured tool steps when the workflow returns a plan")
    private List<Object> steps = new ArrayList<>();

    @Schema(description = "Requested page numbers when Python asks Java to extract text")
    private List<Integer> pageNumbers = new ArrayList<>();

    @Schema(description = "Requested page limit when Python asks Java to extract text")
    private Integer maxPages;

    @Schema(description = "Requested character limit when Python asks Java to extract text")
    private Integer maxCharacters;
}
