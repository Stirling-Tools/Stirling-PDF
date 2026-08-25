package stirling.software.proprietary.policy.model;

import java.util.List;
import java.util.Optional;

/**
 * A stored automation: ordered tool steps, input bindings, and output destinations.
 *
 * <p>Always runnable on demand. Each {@link PipelineInput} references a persisted {@code Source}
 * connection (resolved live at run time) and carries its own optional {@link TriggerConfig}: the
 * trigger decides when that source is pulled, so one input can be watched while another polls, and
 * a {@code null} trigger makes that input manual-only. An input with no trigger, or a policy with
 * no triggered inputs, still runs when the policy is run on demand; a manual run pulls every input.
 *
 * <p>{@code outputIds} reference the {@code Source} locations (resolved live) a run's files are
 * delivered to - a run is delivered to every one; when empty the inline {@link #output} is used
 * (results returned to the caller), the case for editor and one-off policies.
 */
public record Policy(
        String id,
        String name,
        String owner,
        boolean enabled,
        List<PipelineInput> inputs,
        List<PipelineStep> steps,
        OutputSpec output,
        List<String> outputIds,
        Long teamId,
        EditorConfig editor) {

    public Policy {
        inputs = inputs == null ? List.of() : List.copyOf(inputs);
        steps = steps == null ? List.of() : steps;
        output = output == null ? OutputSpec.inline() : output;
        outputIds = outputIds == null ? List.of() : List.copyOf(outputIds);
        editor = editor == null ? EditorConfig.disabled() : editor;
    }

    /** Without editor participation: a swept or on-demand policy. */
    public Policy(
            String id,
            String name,
            String owner,
            boolean enabled,
            List<PipelineInput> inputs,
            List<PipelineStep> steps,
            OutputSpec output,
            List<String> outputIds,
            Long teamId) {
        this(id, name, owner, enabled, inputs, steps, output, outputIds, teamId, null);
    }

    /**
     * Without output references: the inline output is used as-is. Kept for the engine, migrations,
     * and tests, and for editor/one-off policies that return results to the caller rather than a
     * stored destination.
     */
    public Policy(
            String id,
            String name,
            String owner,
            boolean enabled,
            List<PipelineInput> inputs,
            List<PipelineStep> steps,
            OutputSpec output,
            Long teamId) {
        this(id, name, owner, enabled, inputs, steps, output, List.of(), teamId);
    }

    /**
     * Without an explicit owning team. Kept for the engine and tests; the controller always stamps
     * a {@code teamId} on stored policies so they stay scoped to the creating user's team.
     */
    public Policy(
            String id,
            String name,
            String owner,
            boolean enabled,
            List<PipelineInput> inputs,
            List<PipelineStep> steps,
            OutputSpec output) {
        this(id, name, owner, enabled, inputs, steps, output, List.of(), null);
    }

    /** The source ids this policy pulls from, in input order; a derived view for reads. */
    public List<String> sourceIds() {
        return inputs.stream().map(PipelineInput::sourceId).toList();
    }

    /** The distinct trigger types configured across this policy's inputs (manual inputs aside). */
    /**
     * The moment this policy fires in the editor ("upload" / "export"), or empty when the editor
     * does not run it. Legacy blobs are lifted onto {@link EditorConfig} when they are read.
     */
    public Optional<String> editorRunOn() {
        return editor.allowed() ? Optional.of(editor.runOn()) : Optional.empty();
    }

    public List<String> triggerTypes() {
        return inputs.stream()
                .map(PipelineInput::trigger)
                .filter(trigger -> trigger != null)
                .map(TriggerConfig::type)
                .distinct()
                .toList();
    }

    /** A copy with the inline output replaced (e.g. resolved for the engine, or migrated). */
    public Policy withOutput(OutputSpec resolved) {
        return new Policy(
                id, name, owner, enabled, inputs, steps, resolved, outputIds, teamId, editor);
    }

    /** A copy under a different owner (e.g. moving a seed off a placeholder name). */
    public Policy withOwner(String newOwner) {
        return new Policy(
                id, name, newOwner, enabled, inputs, steps, output, outputIds, teamId, editor);
    }

    /** A copy referencing the given saved output destinations. */
    public Policy withOutputIds(List<String> newOutputIds) {
        return new Policy(
                id, name, owner, enabled, inputs, steps, output, newOutputIds, teamId, editor);
    }

    /**
     * This policy's pipeline as the engine sees it (inline output; destinations resolved
     * elsewhere).
     */
    public PipelineDefinition toDefinition() {
        return new PipelineDefinition(name, steps, output);
    }
}
