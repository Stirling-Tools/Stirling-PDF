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
        // TODO: Migration required - was org.springframework.web.method.HandlerMethod (Spring MVC,
        // no Quarkus equivalent). Replaced with the underlying java.lang.reflect.Method. The
        // collaborator McpToolCatalog must be updated to discover JAX-RS resource methods (e.g. via
        // RESTEasy Reactive ResourceScanningSupport / jakarta.ws.rs annotations) instead of
        // Spring's RequestMappingHandlerMapping, and pass a reflect.Method here.
        Method handlerMethod) {

    public enum Target {
        JAVA_ENDPOINT,
        ENGINE_CAPABILITY
    }
}
