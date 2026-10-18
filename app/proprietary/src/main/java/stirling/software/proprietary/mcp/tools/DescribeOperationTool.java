package stirling.software.proprietary.mcp.tools;

import java.util.Set;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import io.swagger.v3.oas.annotations.Operation;

import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.McpTool;
import stirling.software.proprietary.mcp.McpToolAnnotations;
import stirling.software.proprietary.mcp.catalog.McpSchemaAdjuster;
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

    // The main input goes in fileId/fileIds/inputFile at the top level, never in parameters.
    private static final Set<String> MAIN_INPUT = Set.of("fileInput", "fileId", "fileUrl");

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
    public String title() {
        return "Look up an operation's options";
    }

    @Override
    public McpToolAnnotations annotations() {
        return McpToolAnnotations.READ_ONLY;
    }

    @Override
    public String analyticsCategory() {
        return "catalog";
    }

    @Override
    public String description() {
        return "Return one Stirling operation's full parameter schema, what each option means,"
                + " and an example call. Call it when an option you need is not shown in the"
                + " category tool's listing, after a parameter error, and before telling the user"
                + " Stirling cannot do something. Argument: { operation: <op-id> } from the enum"
                + " of any category tool (stirling_convert, _pages, _misc, _security, _ai).";
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
                "Operation id (e.g. compress-pdf, pdf-to-word, cert-sign). See category tool enums.");
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
        String details = details(meta);
        if (details != null) {
            payload.put("details", details);
        }
        payload.put(
                "input",
                McpFileParameters.takesFile(meta)
                        ? "Pass the document as fileId, fileIds, inputFile or file at the top level"
                                + " of the call, not in parameters. Other file inputs listed below"
                                + " take fileIds in parameters."
                        : "No input file: this operation makes a new file from its parameters.");
        payload.put("endpoint", meta.endpointPath());
        payload.put("requiredScope", meta.requiredScope());
        payload.set("parametersSchema", withoutMainInput(meta.paramSchema()));
        payload.set("example", McpOperationExample.of(mapper, meta));
        return McpResponses.json(mapper, payload);
    }

    /** The endpoint's longer @Operation description, which often holds the usage caveats. */
    private static String details(OperationMeta meta) {
        String override = McpSchemaAdjuster.details(meta.id());
        if (override != null) {
            return override;
        }
        if (meta.handlerMethod() == null) {
            return null;
        }
        Operation operation = meta.handlerMethod().getMethodAnnotation(Operation.class);
        if (operation == null || operation.description().isBlank()) {
            return null;
        }
        String text = operation.description().strip().replaceAll("\\s+", " ");
        return text.equals(meta.summary()) ? null : text;
    }

    private ObjectNode withoutMainInput(ObjectNode schema) {
        ObjectNode copy = schema.deepCopy();
        if (copy.get("properties") instanceof ObjectNode properties) {
            MAIN_INPUT.forEach(properties::remove);
        }
        if (copy.get("required") instanceof ArrayNode required) {
            ArrayNode kept = mapper.createArrayNode();
            required.forEach(
                    r -> {
                        if (!MAIN_INPUT.contains(r.asText())) {
                            kept.add(r);
                        }
                    });
            if (kept.isEmpty()) {
                copy.remove("required");
            } else {
                copy.set("required", kept);
            }
        }
        return copy;
    }
}
