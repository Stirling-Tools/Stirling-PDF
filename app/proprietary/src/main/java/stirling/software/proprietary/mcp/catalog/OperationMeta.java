package stirling.software.proprietary.mcp.catalog;

import org.springframework.web.method.HandlerMethod;

import tools.jackson.databind.node.ObjectNode;

/** Metadata for one MCP-exposed operation (PDF endpoint or AI capability). */
public record OperationMeta(
        String id,
        OperationCategory category,
        String summary,
        ObjectNode paramSchema,
        String requiredScope,
        Target target,
        String endpointPath,
        HandlerMethod handlerMethod) {

    public enum Target {
        JAVA_ENDPOINT,
        ENGINE_CAPABILITY
    }
}
