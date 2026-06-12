package stirling.software.proprietary.policy.model;

import java.util.Map;

/**
 * Describes where a pipeline run's output files should be delivered. {@code type} selects a {@code
 * PolicyOutputSink} (e.g. "inline"); {@code options} carries sink-specific configuration.
 *
 * <p>New destinations (folder, S3) are added as new sink beans keyed on a new {@code type} without
 * changing this shape or the engine.
 */
public record OutputSpec(String type, Map<String, Object> options) {
    public OutputSpec {
        options = options == null ? Map.of() : options;
    }

    /** The default destination: store outputs and return them to the caller for download. */
    public static OutputSpec inline() {
        return new OutputSpec("inline", Map.of());
    }

    /** Write outputs to a directory on disk. */
    public static OutputSpec folder(String directory) {
        return new OutputSpec("folder", Map.of("directory", directory));
    }
}
