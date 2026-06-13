package stirling.software.proprietary.policy.model;

import java.util.Map;

/**
 * A {@link Policy}'s optional automatic trigger - what fires it without a person asking. {@code
 * type} selects a trigger kind ("schedule", and in future "webhook", "folder-watch", ...); {@code
 * options} carries type-specific configuration (a {@link Schedule}, a webhook secret, ...).
 *
 * <p>Manual running is <em>not</em> a trigger kind: every policy can always be run on demand, so a
 * policy with no automatic trigger simply has a {@code null} {@code TriggerConfig}. A trigger
 * answers only "when"; where a run's files come from is a separate concern owned by the policy's
 * {@link InputSpec sources}.
 *
 * <p>Data-driven and parallel to {@link OutputSpec}: new trigger kinds are new {@code type} values
 * handled by a new trigger bean, with no change to the model.
 */
public record TriggerConfig(String type, Map<String, Object> options) {

    public TriggerConfig {
        options = options == null ? Map.of() : options;
    }
}
