package stirling.software.proprietary.policy.source;

import java.util.Map;

import stirling.software.proprietary.policy.model.InputSpec;
import stirling.software.proprietary.policy.model.OutputSpec;

/**
 * A persisted, reusable storage location: the instantiation of a source definition. Policies
 * reference sources by {@code id} rather than embedding their config, so one location is configured
 * once and can be used by many policies - as an input (files come from it) and/or as an output (a
 * run's files are delivered to it), which is how a folder or bucket can be both the output of one
 * pipeline and the input of the next.
 *
 * <p>{@code type} keys an {@link stirling.software.proprietary.policy.input.InputSource} bean (and,
 * for writable types, a {@link stirling.software.proprietary.policy.output.PolicyOutputSink}),
 * matching {@link InputSpec#type()}; {@code options} is that location's config. {@code owner} and
 * {@code teamId} scope the source to a team, mirroring {@link
 * stirling.software.proprietary.policy.model.Policy}.
 */
public record Source(
        String id,
        String name,
        String type,
        Map<String, Object> options,
        boolean enabled,
        String owner,
        Long teamId) {

    public Source {
        options = options == null ? Map.of() : options;
    }

    /** The runtime form the policy engine resolves and reads inputs from. */
    public InputSpec toInputSpec() {
        return new InputSpec(type, options);
    }

    /**
     * The runtime form the policy engine delivers a run's outputs to, when this source is used as a
     * policy's destination. Read-only options (e.g. a folder's consume mode) are simply ignored by
     * the output sink.
     */
    public OutputSpec toOutputSpec() {
        return new OutputSpec(type, options);
    }
}
