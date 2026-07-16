package stirling.software.proprietary.policy.output;

import java.util.Map;

import stirling.software.proprietary.policy.model.OutputSpec;

/**
 * A persisted, reusable output destination: the instantiation of an output definition. Policies
 * reference outputs by {@code id} rather than embedding their config, so one destination is
 * configured once and can be written to by many policies.
 *
 * <p>{@code type} keys a {@link PolicyOutputSink} bean, matching {@link OutputSpec#type()}; {@code
 * options} is that sink's config. {@code owner} and {@code teamId} scope the output to a team,
 * mirroring {@link stirling.software.proprietary.policy.source.Source}.
 */
public record Output(
        String id,
        String name,
        String type,
        Map<String, Object> options,
        boolean enabled,
        String owner,
        Long teamId) {

    public Output {
        options = options == null ? Map.of() : options;
    }

    /** The runtime form the policy engine delivers a run's files to. */
    public OutputSpec toOutputSpec() {
        return new OutputSpec(type, options);
    }
}
