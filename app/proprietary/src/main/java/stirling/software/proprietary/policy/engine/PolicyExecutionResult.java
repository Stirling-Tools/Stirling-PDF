package stirling.software.proprietary.policy.engine;

import java.util.List;

import org.springframework.core.io.Resource;

import tools.jackson.databind.JsonNode;

/**
 * Result of a {@link PolicyExecutor} run. {@code files} are final temp files (not yet stored).
 * {@code report}/{@code reportTool} carry the last step's structured report and its operation, or
 * null if no step produced one.
 */
public record PolicyExecutionResult(List<Resource> files, JsonNode report, String reportTool) {}
