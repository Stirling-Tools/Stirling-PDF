package stirling.software.proprietary.policy.model;

import java.util.List;

/**
 * An ordered chain of tool steps plus its output destinations; the unit the engine executes.
 *
 * <p>{@code outputs} may be empty for callers that handle result files themselves (e.g. the AI
 * workflow, which builds its own response payload) - the engine then falls back to inline delivery.
 * A run's files are delivered to every destination in the list.
 *
 * <p>{@code routing} is per-document delivery: each entry pairs a rule with its resolved
 * destination, tried in order, first match wins. When present, a file the rules claim goes to its
 * matched destination; a file no rule claims falls back to {@code outputs}. Empty means every file
 * goes to every {@code outputs} destination.
 */
public record PipelineDefinition(
        String name,
        List<PipelineStep> steps,
        List<OutputSpec> outputs,
        List<RoutedDestination> routing) {
    public PipelineDefinition {
        steps = steps == null ? List.of() : steps;
        outputs = outputs == null ? List.of() : List.copyOf(outputs);
        routing = routing == null ? List.of() : List.copyOf(routing);
    }

    /** Without routing rules: every file goes to every destination. */
    public PipelineDefinition(String name, List<PipelineStep> steps, List<OutputSpec> outputs) {
        this(name, steps, outputs, List.of());
    }

    /** Convenience for the common single-destination (or inline) case. A null output is empty. */
    public PipelineDefinition(String name, List<PipelineStep> steps, OutputSpec output) {
        this(name, steps, output == null ? List.of() : List.of(output));
    }
}
