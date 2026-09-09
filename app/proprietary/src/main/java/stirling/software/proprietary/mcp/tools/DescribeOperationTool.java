package stirling.software.proprietary.mcp.tools;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.McpTool;
import stirling.software.proprietary.mcp.catalog.McpToolCatalog;
import stirling.software.proprietary.mcp.catalog.OperationMeta;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Returns the JSON Schema for one operation's parameters, from the live {@link McpToolCatalog}. */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class DescribeOperationTool implements McpTool {

    private final ObjectMapper mapper;
    private final ObjectProvider<McpToolCatalog> catalogProvider;

    public DescribeOperationTool(ObjectMapper mapper, ObjectProvider<McpToolCatalog> catalog) {
        this.mapper = mapper;
        this.catalogProvider = catalog;
    }

    @Override
    public String name() {
        return "stirling_describe_operation";
    }

    @Override
    public String description() {
        return "Return the full JSON Schema for one Stirling operation's parameters. Call this "
                + "before invoking a category tool to learn the exact shape of `parameters`. "
                + "Argument: { operation: <op-id> } where <op-id> appears in the enum of any "
                + "category tool (stirling_convert, _pages, _misc, _security, _ai).";
    }

    @Override
    public ObjectNode inputSchema() {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        schema.put("additionalProperties", false);
        ObjectNode props = schema.putObject("properties");
        ObjectNode op = props.putObject("operation");
        op.put("type", "string");
        op.put(
                "description",
                "Operation id (e.g. compress-pdf, pdf-to-word, q-and-a). See category tool enums.");
        ArrayNode required = schema.putArray("required");
        required.add("operation");
        return schema;
    }

    @Override
    public ObjectNode call(JsonNode arguments, McpCallContext context) {
        JsonNode opNode = arguments == null ? null : arguments.get("operation");
        if (opNode == null || !opNode.isTextual() || opNode.asText().isBlank()) {
            return McpResponses.error(mapper, "Missing required argument: operation");
        }
        String opId = opNode.asText();
        McpToolCatalog catalog = catalogProvider.getIfAvailable();
        if (catalog == null) {
            return McpResponses.error(mapper, "MCP catalog is not available");
        }
        OperationMeta meta = catalog.findByOperationId(opId).orElse(null);
        if (meta == null) {
            return McpResponses.error(mapper, "Unknown or disabled operation: " + opId);
        }

        ObjectNode payload = mapper.createObjectNode();
        payload.put("operation", meta.id());
        payload.put("category", meta.category().toolName());
        payload.put("summary", meta.summary());
        payload.put("endpoint", meta.endpointPath());
        payload.put("requiredScope", meta.requiredScope());
        payload.set("parametersSchema", meta.paramSchema());
        return McpResponses.json(mapper, payload);
    }
}
