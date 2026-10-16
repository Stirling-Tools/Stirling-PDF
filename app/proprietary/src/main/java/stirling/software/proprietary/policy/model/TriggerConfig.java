package stirling.software.proprietary.policy.model;

import java.util.Map;

/**
 * A {@link Policy}'s automatic trigger; {@code type} keys a trigger bean (e.g. "schedule"). Manual
 * running is not a trigger kind: ordinary manual-only policies carry a {@code null} {@code
 * TriggerConfig}. Processing-folder inputs without a trigger default to storage-folder polling.
 * Answers only "when"; file sources are the policy's {@link InputSpec}s.
 */
public record TriggerConfig(String type, Map<String, Object> options) {

    public static final String STORAGE_FOLDER_WATCH = "storage-folder-watch";

    public TriggerConfig {
        options = options == null ? Map.of() : options;
    }
}
