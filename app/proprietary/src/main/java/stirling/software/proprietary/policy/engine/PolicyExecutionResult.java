package stirling.software.proprietary.policy.engine;

import java.util.List;

import org.springframework.core.io.Resource;

import tools.jackson.databind.JsonNode;

/**
 * Result of running a pipeline through {@link PolicyExecutor}.
 *
 * <p>{@code files} are the final output resources (temp files, not yet stored to {@code
 * FileStorage}). {@code report} is the structured metadata payload captured from the last step that
 * produced one (a JSON body, or an {@code X-Stirling-Tool-Report} header), with {@code reportTool}
 * naming the step it came from; both are null when no step produced a report.
 */
public record PolicyExecutionResult(List<Resource> files, JsonNode report, String reportTool) {}
