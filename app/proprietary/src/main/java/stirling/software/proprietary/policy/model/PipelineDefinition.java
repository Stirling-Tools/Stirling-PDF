package stirling.software.proprietary.policy.model;

import java.util.List;

/**
 * An ordered chain of tool steps plus its output destinations; the unit the engine executes.
 *
 * <p>{@code outputs} may be empty for callers that handle result files themselves (e.g. the AI
 * workflow, which builds its own response payload) - the engine then falls back to inline delivery.
 * A run's files are delivered to every destination in the list.
 */
public record PipelineDefinition(String name, List<PipelineStep> steps, List<OutputSpec> outputs) {
    public PipelineDefinition {
        steps = steps == null ? List.of() : steps;
        outputs = outputs == null ? List.of() : List.copyOf(outputs);
    }

    /** Convenience for the common single-destination (or inline) case. A null output is empty. */
    public PipelineDefinition(String name, List<PipelineStep> steps, OutputSpec output) {
        this(name, steps, output == null ? List.of() : List.of(output));
    }
}
