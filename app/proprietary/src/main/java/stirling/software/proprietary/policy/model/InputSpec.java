package stirling.software.proprietary.policy.model;

import java.util.Map;

/**
 * Where a policy's input files come from. {@code type} selects an {@code InputSource} ("none",
 * "folder", "s3", ...); {@code options} carries source-specific configuration (a directory, a
 * bucket, a dedup mode, ...).
 *
 * <p>Data-driven and parallel to {@link OutputSpec}/{@link TriggerConfig}: a new source kind is a
 * new {@code type} handled by a new {@code InputSource} bean. {@code "none"} means the policy is
 * run with no input files (generator pipelines, or files supplied directly by a manual/event run).
 */
public record InputSpec(String type, Map<String, Object> options) {

    public InputSpec {
        type = type == null || type.isBlank() ? "none" : type;
        options = options == null ? Map.of() : options;
    }

    /** No input source: the run gets no files unless supplied directly. */
    public static InputSpec none() {
        return new InputSpec("none", Map.of());
    }

    /** Read input files from a directory on disk. */
    public static InputSpec folder(String directory) {
        return new InputSpec("folder", Map.of("directory", directory));
    }
}
