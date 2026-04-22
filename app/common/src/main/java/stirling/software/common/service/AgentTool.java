package stirling.software.common.service;

import java.util.Arrays;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Registry of AI-agent tools that the Python orchestrator may reference from a plan step.
 *
 * <p>The Python {@code AgentToolId} enum emits bare identifiers (e.g. {@code "pdfCommentAgent"}) on
 * the wire, but Java's {@link InternalApiClient} dispatches by URL path. This enum is the single
 * source of truth mapping {@code id → Spring endpoint path}. Kept as a compile-time Java enum
 * (rather than a runtime-registered service) so it is safe to reference from modules that cannot
 * have DI dependencies on {@code proprietary/}.
 *
 * <p>Values MUST stay in sync with {@code engine/src/stirling/models/agent_tool_models.py
 * AgentToolId}.
 */
public enum AgentTool {
    MATH_AUDITOR_AGENT("mathAuditorAgent", "/api/v1/ai/math-auditor-agent"),
    PDF_COMMENT_AGENT("pdfCommentAgent", "/api/v1/ai/pdf-comment-agent");

    private final String id;
    private final String path;

    AgentTool(String id, String path) {
        this.id = id;
        this.path = path;
    }

    public String id() {
        return id;
    }

    public String path() {
        return path;
    }

    /** Resolve by the wire-level id (matches Python {@code AgentToolId.value}). */
    public static Optional<AgentTool> byId(String id) {
        if (id == null) {
            return Optional.empty();
        }
        for (AgentTool tool : values()) {
            if (tool.id.equals(id)) {
                return Optional.of(tool);
            }
        }
        return Optional.empty();
    }

    /** All known agent-tool endpoint paths; used by internal dispatch allowlist. */
    public static Set<String> allPaths() {
        return Arrays.stream(values()).map(AgentTool::path).collect(Collectors.toUnmodifiableSet());
    }
}
