package stirling.software.proprietary.policy.model;

import java.util.Map;

/**
 * One source a policy's input files come from. {@code type} selects an {@code InputSource}
 * ("folder", and in future "s3", ...); {@code options} carries source-specific configuration (a
 * directory, a bucket, a dedup mode, ...).
 *
 * <p>A policy holds a list of these; a run pulls from every one. An empty list means the policy
 * runs with no input files (a generator pipeline, or files supplied directly to a manual run).
 *
 * <p>Data-driven and parallel to {@link OutputSpec}/{@link TriggerConfig}: a new source kind is a
 * new {@code type} handled by a new {@code InputSource} bean.
 */
public record InputSpec(String type, Map<String, Object> options) {

    public InputSpec {
        options = options == null ? Map.of() : options;
    }

    /** Read input files from a directory on disk. */
    public static InputSpec folder(String directory) {
        return new InputSpec("folder", Map.of("directory", directory));
    }
}
