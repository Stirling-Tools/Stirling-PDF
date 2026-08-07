package stirling.software.proprietary.policy.model;

import java.util.Map;

/**
 * A single tool invocation. {@code operation} is a Stirling endpoint path (e.g. {@code
 * /api/v1/misc/compress-pdf}) per the {@code InternalApiClient} convention; {@code parameters} are
 * scalar form fields.
 *
 * <p>{@code fileParameters} maps a tool's named file field (e.g. {@code stampImage}, beyond the
 * primary {@code fileInput} stream) to an asset key in the run's supporting-file store, keeping
 * supporting inputs out of the document stream that flows step to step.
 */
public record PipelineStep(
        String operation, Map<String, Object> parameters, Map<String, String> fileParameters) {

    public PipelineStep {
        parameters = parameters == null ? Map.of() : parameters;
        fileParameters = fileParameters == null ? Map.of() : fileParameters;
    }

    /** A step with no supporting-file bindings. */
    public PipelineStep(String operation, Map<String, Object> parameters) {
        this(operation, parameters, Map.of());
    }
}
