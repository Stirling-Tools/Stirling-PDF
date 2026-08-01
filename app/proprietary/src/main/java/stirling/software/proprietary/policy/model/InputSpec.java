package stirling.software.proprietary.policy.model;

import java.util.Map;

/**
 * One input source for a policy. {@code type} keys an {@code InputSource} bean; a run pulls from
 * every source.
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
