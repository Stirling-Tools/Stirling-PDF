package stirling.software.proprietary.policy.model;

import java.util.Map;

/**
 * A single tool invocation in a pipeline: the API endpoint path to call and the parameters to pass.
 *
 * <p>{@code operation} is a Stirling tool endpoint path (e.g. {@code /api/v1/misc/compress-pdf}),
 * matching the dispatch convention used by {@code InternalApiClient}. {@code parameters} are the
 * tool-specific form fields.
 */
public record PipelineStep(String operation, Map<String, Object> parameters) {
    public PipelineStep {
        parameters = parameters == null ? Map.of() : parameters;
    }
}
