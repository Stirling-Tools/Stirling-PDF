package stirling.software.proprietary.policy.model;

import java.util.Map;

/** Where a run's outputs are delivered. {@code type} keys a {@code PolicyOutputSink} bean. */
public record OutputSpec(String type, Map<String, Object> options) {
    public OutputSpec {
        options = options == null ? Map.of() : options;
    }

    /** Default sink: store outputs and return them to the caller for download. */
    public static OutputSpec inline() {
        return new OutputSpec("inline", Map.of());
    }

    /** Write outputs to a directory on disk. */
    public static OutputSpec folder(String directory) {
        return new OutputSpec("folder", Map.of("directory", directory));
    }
}
