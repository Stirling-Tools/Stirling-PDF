package stirling.software.proprietary.policy.model;

import java.util.List;

/**
 * An ordered chain of tool steps plus an output destination; the unit the engine executes.
 *
 * <p>{@code output} may be null for callers that handle result files themselves (e.g. the AI
 * workflow, which builds its own response payload).
 */
public record PipelineDefinition(String name, List<PipelineStep> steps, OutputSpec output) {
    public PipelineDefinition {
        steps = steps == null ? List.of() : steps;
    }
}
