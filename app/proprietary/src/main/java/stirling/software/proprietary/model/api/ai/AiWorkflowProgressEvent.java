package stirling.software.proprietary.model.api.ai;

import com.fasterxml.jackson.annotation.JsonInclude;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AiWorkflowProgressEvent {
    private AiWorkflowPhase phase;
    private long timestamp;

    /** The tool endpoint path being executed, for {@link AiWorkflowPhase#EXECUTING_TOOL} events. */
    private String tool;

    /**
     * 1-based index of the current plan step, for {@link AiWorkflowPhase#EXECUTING_TOOL} events.
     */
    private Integer stepIndex;

    /** Total number of plan steps, for {@link AiWorkflowPhase#EXECUTING_TOOL} events. */
    private Integer stepCount;

    /**
     * Engine-emitted event payload, for {@link AiWorkflowPhase#ENGINE_PROGRESS} events. The payload
     * is a typed subtype keyed on its {@code phase} string (e.g. {@code "whole_doc_slice_done"})
     * carrying phase-specific fields (slice index, page range, durations, etc.) that the frontend
     * can render as detailed progress.
     */
    private AiEngineProgressDetail engineDetail;

    public static AiWorkflowProgressEvent of(AiWorkflowPhase phase) {
        return new AiWorkflowProgressEvent(
                phase, System.currentTimeMillis(), null, null, null, null);
    }

    public static AiWorkflowProgressEvent executingTool(String tool, int stepIndex, int stepCount) {
        return new AiWorkflowProgressEvent(
                AiWorkflowPhase.EXECUTING_TOOL,
                System.currentTimeMillis(),
                tool,
                stepIndex,
                stepCount,
                null);
    }

    public static AiWorkflowProgressEvent engineProgress(AiEngineProgressDetail detail) {
        return new AiWorkflowProgressEvent(
                AiWorkflowPhase.ENGINE_PROGRESS,
                System.currentTimeMillis(),
                null,
                null,
                null,
                detail);
    }
}
