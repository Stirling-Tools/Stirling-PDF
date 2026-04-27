package stirling.software.proprietary.model.api.ai;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import io.swagger.v3.oas.annotations.media.Schema;

import lombok.Data;

/**
 * Embedded plan optionally carried inside a question answer response. When present, the consumer
 * (Java) runs the plan steps before delivering the answer; on the resume turn the engine returns
 * the real answer using the captured tool reports.
 *
 * <p>Mirrors the engine's {@code EditPlanResponse} shape but is nested inside an answer rather than
 * acting as the top-level outcome — matches the engine's {@code
 * PdfQuestionAnswerResponse.edit_plan} field.
 */
@Data
@Schema(description = "Plan that must run before the answer is final")
public class AiWorkflowEditPlan {

    @Schema(description = "Optional human-readable summary of the plan")
    private String summary;

    @Schema(description = "Optional rationale for the plan")
    private String rationale;

    @Schema(description = "Tool steps to execute before resuming")
    private List<Map<String, Object>> steps = new ArrayList<>();

    @Schema(description = "AI engine capability to resume with after running the steps")
    private String resumeWith;
}
