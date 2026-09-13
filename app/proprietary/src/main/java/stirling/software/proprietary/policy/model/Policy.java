package stirling.software.proprietary.policy.model;

import java.util.List;
import java.util.Optional;

/** A stored automation: ordered tool steps, input bindings, and output destinations. */
public record Policy(
        String id,
        String name,
        String owner,
        boolean enabled,
        boolean required,
        String icon,
        List<PipelineInput> inputs,
        List<PipelineStep> steps,
        OutputSpec output,
        List<String> outputIds,
        Long teamId,
        EditorConfig editor,
        /** The owning product surface; {@link #SURFACE_POLICY} unless stamped otherwise. */
        String surface) {

    public Policy {
        icon = icon == null ? "" : icon;
        inputs = inputs == null ? List.of() : List.copyOf(inputs);
        steps = steps == null ? List.of() : steps;
        output = output == null ? OutputSpec.inline() : output;
        outputIds = outputIds == null ? List.of() : List.copyOf(outputIds);
        editor = editor == null ? EditorConfig.disabled() : editor;
        surface = surface == null || surface.isBlank() ? SURFACE_POLICY : surface;
    }

    /** The record belongs to the org policies surface (the default). */
    public static final String SURFACE_POLICY = "policy";

    /** The record is a processing-folder pair, served only by its own route. */
    public static final String SURFACE_PROCESSING_FOLDER = "processing-folder";

    /**
     * Without the {@code required} flag, {@code icon}, or editor participation: defaults to an
     * ordinary (non-blocking) pipeline, no icon, and a swept/on-demand policy. Kept for the many
     * callers and tests written before those fields; the frontend and stores that care use the full
     * constructor.
     */
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
        this(
                id,
                name,
                owner,
                enabled,
                false,
                "",
                inputs,
                steps,
                output,
                outputIds,
                teamId,
                null,
                SURFACE_POLICY);
    }

    /**
     * Without the {@code required} flag or {@code icon} but with explicit editor participation: the
     * seeded Classification policy runs on the editor, so it must set {@link EditorConfig} even
     * though it predates the {@code required} and icon fields.
     */
    public Policy(
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
        this(
                id,
                name,
                owner,
                enabled,
                false,
                "",
                inputs,
                steps,
                output,
                outputIds,
                teamId,
                editor,
                SURFACE_POLICY);
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

    /**
     * The moment this policy fires in the editor ("upload" / "export"), or empty when the editor
     * does not run it. Legacy blobs are lifted onto {@link EditorConfig} when they are read.
     */
    public Optional<String> editorRunOn() {
        return editor.allowed() ? Optional.of(editor.runOn()) : Optional.empty();
    }

    /** The distinct trigger types configured across this policy's inputs (manual inputs aside). */
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
                id, name, owner, enabled, required, icon, inputs, steps, resolved, outputIds,
                teamId, editor, surface);
    }

    /** A copy under a different owner (e.g. moving a seed off a placeholder name). */
    public Policy withOwner(String newOwner) {
        return new Policy(
                id, name, newOwner, enabled, required, icon, inputs, steps, output, outputIds,
                teamId, editor, surface);
    }

    /** A copy referencing the given saved output destinations. */
    public Policy withOutputIds(List<String> newOutputIds) {
        return new Policy(
                id,
                name,
                owner,
                enabled,
                required,
                icon,
                inputs,
                steps,
                output,
                newOutputIds,
                teamId,
                editor,
                surface);
    }

    public Policy withEnabled(boolean newEnabled) {
        return new Policy(
                id,
                name,
                owner,
                newEnabled,
                required,
                icon,
                inputs,
                steps,
                output,
                outputIds,
                teamId,
                editor,
                surface);
    }

    public Policy withSurface(String newSurface) {
        return new Policy(
                id,
                name,
                owner,
                enabled,
                required,
                icon,
                inputs,
                steps,
                output,
                outputIds,
                teamId,
                editor,
                newSurface);
    }

    /**
     * This policy's pipeline as the engine sees it (inline output; destinations resolved
     * elsewhere).
     */
    public PipelineDefinition toDefinition() {
        return new PipelineDefinition(name, steps, output);
    }
}
