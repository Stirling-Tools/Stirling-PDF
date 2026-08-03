package stirling.software.proprietary.mcp.catalog;

import java.lang.reflect.Method;

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
        Method handlerMethod) {

    public enum Target {
        JAVA_ENDPOINT,
        ENGINE_CAPABILITY
    }
}
