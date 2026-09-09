package stirling.software.proprietary.policy.model;

import java.util.Map;

/**
 * A {@link Policy}'s automatic trigger; {@code type} keys a trigger bean (e.g. "schedule"). Manual
 * running is not a trigger kind: a manual-only policy carries a {@code null} {@code TriggerConfig}.
 * Answers only "when"; file sources are the policy's {@link InputSpec}s.
 */
public record TriggerConfig(String type, Map<String, Object> options) {

    public TriggerConfig {
        options = options == null ? Map.of() : options;
    }
}
