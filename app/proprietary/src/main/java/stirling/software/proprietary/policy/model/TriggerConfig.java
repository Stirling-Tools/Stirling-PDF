package stirling.software.proprietary.policy.model;

import java.util.Map;

/**
 * How a {@link Policy} is automatically triggered. {@code type} selects a trigger kind ("manual",
 * "folder", "schedule", "s3"); {@code options} carries type-specific configuration (a folder path,
 * a cron expression, a bucket, ...).
 *
 * <p>Data-driven and parallel to {@link OutputSpec}: new trigger kinds are new {@code type} values
 * handled by a new trigger bean, with no change to the model. {@code "manual"} means there is no
 * automatic trigger - the policy is only ever run on demand.
 */
public record TriggerConfig(String type, Map<String, Object> options) {

    public TriggerConfig {
        type = type == null || type.isBlank() ? "manual" : type;
        options = options == null ? Map.of() : options;
    }

    /** No automatic trigger; the policy is run on demand only. */
    public static TriggerConfig manual() {
        return new TriggerConfig("manual", Map.of());
    }
}
