package stirling.software.proprietary.policy.model;

import java.util.Map;

/**
 * A single tool invocation in a pipeline: the API endpoint path to call and the inputs to pass.
 *
 * <p>{@code operation} is a Stirling tool endpoint path (e.g. {@code /api/v1/misc/compress-pdf}),
 * matching the dispatch convention used by {@code InternalApiClient}. {@code parameters} are the
 * tool-specific scalar form fields.
 *
 * <p>{@code fileParameters} binds a tool's named file fields (beyond the primary {@code fileInput}
 * stream) to supporting files supplied with the run: it maps the form field name (e.g. {@code
 * stampImage}, {@code overlayFiles}) to an asset key in the run's supporting-file store. This keeps
 * supporting inputs (a stamp image, a certificate, an overlay) out of the document stream that
 * flows step to step.
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
