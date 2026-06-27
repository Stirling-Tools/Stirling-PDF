package stirling.software.proprietary.policy.source;

import java.util.Map;

import stirling.software.proprietary.policy.model.InputSpec;

/**
 * A persisted, reusable input connection: the instantiation of a source definition. Policies
 * reference sources by {@code id} rather than embedding their config, so one connection is
 * configured once and can feed many policies.
 *
 * <p>{@code type} keys an {@link stirling.software.proprietary.policy.input.InputSource} bean,
 * matching {@link InputSpec#type()}; {@code options} is that source's config. {@code owner} and
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

    /** The runtime form the policy engine resolves and runs against. */
    public InputSpec toInputSpec() {
        return new InputSpec(type, options);
    }
}
