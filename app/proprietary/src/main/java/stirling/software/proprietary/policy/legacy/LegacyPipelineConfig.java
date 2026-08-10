package stirling.software.proprietary.policy.legacy;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * A pipeline JSON in the pre-policy format: the shape written into a watched folder. Parsed here
 * rather than reusing the core model so the policy module stays independent of it.
 *
 * <p>{@code outputDir} and {@code outputFileName} are templates the legacy runner expanded at write
 * time; {@link LegacyPipelineConverter} resolves them into a destination and a naming pattern.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record LegacyPipelineConfig(
        String name,
        @JsonProperty("pipeline") List<LegacyOperation> operations,
        String outputDir,
        String outputFileName) {

    /** The legacy sentinel for "return the results to the caller" rather than write them out. */
    public static final String HTTP_WEB_REQUEST = "httpWebRequest";

    public LegacyPipelineConfig {
        operations = operations == null ? List.of() : List.copyOf(operations);
    }

    /** One tool invocation: an endpoint path plus its scalar form fields. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record LegacyOperation(String operation, Map<String, Object> parameters) {

        public LegacyOperation {
            parameters = parameters == null ? Map.of() : Map.copyOf(parameters);
        }
    }

    /** Whether results were returned to the caller instead of written to a directory. */
    public boolean returnsToCaller() {
        return HTTP_WEB_REQUEST.equals(outputDir);
    }
}
