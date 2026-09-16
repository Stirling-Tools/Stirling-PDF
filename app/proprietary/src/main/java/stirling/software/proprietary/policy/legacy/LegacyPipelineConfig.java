package stirling.software.proprietary.policy.legacy;

import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * A pipeline JSON in the pre-policy format. Parsed here rather than reusing the core model so the
 * policy module stays independent of it; {@link LegacyPipelineConverter} resolves the templates.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record LegacyPipelineConfig(
        String name,
        @JsonProperty("pipeline") List<LegacyOperation> operations,
        String outputDir,
        String outputFileName) {

    /** Legacy sentinel for "return results to the caller" rather than write them out. */
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

    public boolean returnsToCaller() {
        return HTTP_WEB_REQUEST.equals(outputDir);
    }
}
