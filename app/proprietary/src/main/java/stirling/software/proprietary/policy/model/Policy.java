package stirling.software.proprietary.policy.model;

import java.util.List;

/**
 * A stored automation: an ordered chain of tool steps, the sources its input files come from, and
 * an output destination for the results.
 *
 * <p>Every policy can always be run on demand (manually). It may additionally carry one automatic
 * {@link TriggerConfig} - usually a schedule - that fires it without a person asking; a {@code
 * null} trigger means manual-only. A trigger decides <em>when</em> a run happens and a {@link
 * InputSpec source} decides <em>where</em> its files come from; the two are independent, and a run
 * pulls from every configured source.
 *
 * <p>This is the feature's central configuration object - what a user defines and the engine runs.
 */
public record Policy(
        String id,
        String name,
        String owner,
        boolean enabled,
        TriggerConfig trigger,
        List<InputSpec> sources,
        List<PipelineStep> steps,
        OutputSpec output) {

    public Policy {
        sources = sources == null ? List.of() : List.copyOf(sources);
        steps = steps == null ? List.of() : steps;
        output = output == null ? OutputSpec.inline() : output;
    }

    /** A policy with no configured sources (a generator, or files supplied directly to a run). */
    public Policy(
            String id,
            String name,
            String owner,
            boolean enabled,
            TriggerConfig trigger,
            List<PipelineStep> steps,
            OutputSpec output) {
        this(id, name, owner, enabled, trigger, List.of(), steps, output);
    }

    /** The engine-level, trigger-agnostic view of this policy's pipeline. */
    public PipelineDefinition toDefinition() {
        return new PipelineDefinition(name, steps, output);
    }
}
