package stirling.software.proprietary.mcp.tools;

import java.io.IOException;
import java.util.List;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.McpTool;
import stirling.software.proprietary.mcp.catalog.McpToolCatalog;
import stirling.software.proprietary.mcp.catalog.OperationCategory;
import stirling.software.proprietary.mcp.catalog.OperationMeta;
import stirling.software.proprietary.service.AiEngineClient;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Exposes curated Python agent capabilities as a single MCP tool, sourced from the engine
 * capabilities manifest.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class StirlingAiTool implements McpTool {

    private final ObjectMapper mapper;
    private final ObjectProvider<McpToolCatalog> catalogProvider;
    private final ObjectProvider<AiEngineClient> engineClientProvider;

    public StirlingAiTool(
            ObjectMapper mapper,
            ObjectProvider<McpToolCatalog> catalog,
            ObjectProvider<AiEngineClient> engineClient) {
        this.mapper = mapper;
        this.catalogProvider = catalog;
        this.engineClientProvider = engineClient;
    }

    @Override
    public String name() {
        return "stirling_ai";
    }

    @Override
    public String description() {
        return "Invoke a Stirling AI agent capability (Q&A about a PDF, edit-plan generation,"
                + " inline comments, math audit, draft-spec helper). Call"
                + " stirling_describe_operation with the chosen capability id to get its"
                + " parameters schema before invoking this tool. Some capabilities return content"
                + " inline; others return a job reference that resolves to a file when ready.";
    }

    @Override
    public ObjectNode inputSchema() {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        schema.put("additionalProperties", false);
        ObjectNode props = schema.putObject("properties");

        ObjectNode op = props.putObject("operation");
        op.put("type", "string");
        StringBuilder desc = new StringBuilder();
        desc.append("Capability id from the engine manifest. Available capabilities:\n");
        ArrayNode opEnum = op.putArray("enum");
        for (OperationMeta m : aiOps()) {
            opEnum.add(m.id());
            desc.append("- ").append(m.id()).append(" - ").append(m.summary()).append('\n');
        }
        op.put("description", desc.toString().trim());

        ObjectNode params = props.putObject("parameters");
        params.put("type", "object");
        params.put("description", "Per-capability parameters.");
        params.put("additionalProperties", true);

        ObjectNode fileId = props.putObject("fileId");
        fileId.put("type", "string");
        fileId.put(
                "description",
                "Reference to a previously-uploaded PDF in Stirling's job store. Required for"
                        + " capabilities that consume a document.");

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
        if (meta == null || meta.category() != OperationCategory.AI) {
            return McpResponses.error(
                    mapper,
                    "Unknown AI capability '"
                            + opId
                            + "'. The engine manifest may not be loaded yet - retry shortly or"
                            + " confirm the engine is reachable.");
        }
        if (!context.hasScope(meta.requiredScope())) {
            return McpResponses.error(
                    mapper,
                    "Insufficient scope: this capability requires '" + meta.requiredScope() + "'.");
        }
        AiEngineClient client = engineClientProvider.getIfAvailable();
        if (client == null) {
            return McpResponses.error(
                    mapper, "AI engine client is not configured - enable aiEngine in settings.");
        }
        if (meta.endpointPath() == null) {
            return McpResponses.error(
                    mapper,
                    "Capability '" + opId + "' has no route configured in the engine manifest.");
        }
        JsonNode params = arguments.get("parameters");
        String body = (params == null ? mapper.createObjectNode() : params).toString();
        try {
            String response = client.post(meta.endpointPath(), body, context.stirlingUserId());
            return McpResponses.text(mapper, response);
        } catch (IOException e) {
            log.warn("MCP AI capability '{}' engine request failed", opId, e);
            return McpResponses.error(
                    mapper, "Engine request failed for capability '" + opId + "'.");
        }
    }

    private List<OperationMeta> aiOps() {
        McpToolCatalog catalog = catalogProvider.getIfAvailable();
        if (catalog == null) {
            return List.of();
        }
        return catalog.enabledOps(OperationCategory.AI);
    }
}
