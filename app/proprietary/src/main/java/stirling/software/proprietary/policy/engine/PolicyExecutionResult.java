package stirling.software.proprietary.policy.engine;

import java.util.List;

import org.springframework.core.io.Resource;

import tools.jackson.databind.JsonNode;

/**
 * Result of a {@link PolicyExecutor} run. {@code files} are final temp files (not yet stored).
 * {@code origins} is parallel to {@code files}: each entry is the index into the original pipeline
 * inputs that the output traces back to, or {@code null} when it has no single source (e.g. a merge
 * combining several inputs, or a generated file). Callers use it to map an output back onto the
 * file it came from. {@code report}/{@code reportTool} carry the last step's structured report and
 * its operation, or null if no step produced one.
 */
public record PolicyExecutionResult(
        List<Resource> files, List<Integer> origins, JsonNode report, String reportTool) {}
