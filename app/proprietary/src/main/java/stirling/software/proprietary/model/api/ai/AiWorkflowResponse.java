package stirling.software.proprietary.model.api.ai;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

import tools.jackson.databind.JsonNode;

@Data
@Schema(description = "Structured AI workflow result")
public class AiWorkflowResponse {

    @Schema(description = "Workflow outcome")
    private AiWorkflowOutcome outcome;

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
    private List<Map<String, Object>> steps = new ArrayList<>();

    @Schema(
            description =
                    "Tool endpoint path for tool_call outcomes (e.g. /api/v1/misc/compress-pdf)")
    private String tool;

    @Schema(description = "Tool parameters for tool_call outcomes")
    private Map<String, Object> parameters;

    @Schema(description = "Result file ID after tool execution completes (single-file result)")
    private String fileId;

    @Schema(description = "Result filename after tool execution completes (single-file result)")
    private String fileName;

    @Schema(description = "Result MIME type after tool execution completes (single-file result)")
    private String contentType;

    @Schema(
            description =
                    "Result files produced by the workflow. Always populated on completed outcomes"
                            + " with at least one entry; for single-file results this mirrors"
                            + " fileId/fileName/contentType.")
    private List<AiWorkflowResultFile> resultFiles = new ArrayList<>();

    @Schema(description = "Per-file text extraction requests from the AI engine")
    private List<AiWorkflowFileRequest> files = new ArrayList<>();

    @Schema(description = "Maximum number of pages the AI engine wants text extracted from")
    private Integer maxPages;

    @Schema(description = "Maximum number of characters the AI engine wants extracted")
    private Integer maxCharacters;

    @Schema(description = "AI engine capability to resume with on the next turn")
    private String resumeWith;

    @Schema(
            description =
                    "Optional structured report from the tool (e.g. math-auditor Verdict, PDF"
                            + " comment-agent summary). Tools surface this either via a JSON response"
                            + " body or via the X-Stirling-Tool-Report header. May be null for tools"
                            + " that produce only a file.")
    private JsonNode report;

    @Schema(
            description =
                    "Optional plan attached to an answer outcome. When non-null on outcome=ANSWER,"
                            + " run the plan steps before delivering the answer; the resumed call"
                            + " produces the real answer.")
    private AiWorkflowEditPlan editPlan;
}
