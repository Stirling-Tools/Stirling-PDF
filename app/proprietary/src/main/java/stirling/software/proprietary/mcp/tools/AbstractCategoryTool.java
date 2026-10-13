package stirling.software.proprietary.mcp.tools;

import java.util.List;

import org.springframework.beans.factory.ObjectProvider;

import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.McpTool;
import stirling.software.proprietary.mcp.McpToolAnnotations;
import stirling.software.proprietary.mcp.catalog.McpToolCatalog;
import stirling.software.proprietary.mcp.catalog.OperationCategory;
import stirling.software.proprietary.mcp.catalog.OperationMeta;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/**
 * Common scaffolding for the PDF category tools. Operation ids and summaries come from the live
 * {@link McpToolCatalog}.
 */
abstract class AbstractCategoryTool implements McpTool {

    protected final ObjectMapper mapper;
    protected final ObjectProvider<McpToolCatalog> catalogProvider;
    protected final ObjectProvider<McpOperationExecutor> executorProvider;

    protected AbstractCategoryTool(
            ObjectMapper mapper,
            ObjectProvider<McpToolCatalog> catalog,
            ObjectProvider<McpOperationExecutor> executor) {
        this.mapper = mapper;
        this.catalogProvider = catalog;
        this.executorProvider = executor;
    }

    protected abstract OperationCategory category();

    @Override
    public McpToolAnnotations annotations() {
        return McpToolAnnotations.PRODUCES_FILE;
    }

    @Override
    public boolean rendersWidget() {
        return true;
    }

    @Override
    public List<String> fileParams() {
        return List.of(McpInputFiles.ATTACHMENT_ARG);
    }

    protected List<OperationMeta> enabledOperations() {
        McpToolCatalog catalog = catalogProvider.getIfAvailable();
        if (catalog == null) {
            return List.of();
        }
        return catalog.enabledOps(category());
    }

    @Override
    public ObjectNode inputSchema() {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        schema.put("additionalProperties", false);

        ObjectNode props = schema.putObject("properties");

        ObjectNode op = props.putObject("operation");
        op.put("type", "string");
        List<OperationMeta> enabled = enabledOperations();
        StringBuilder opDesc = new StringBuilder();
        // Signatures inline so models can call directly instead of describing every op first.
        opDesc.append(
                "Operation id from this category. Each lists its parameters as name:type (? ="
                        + " optional, =default, a|b allowed values, fileId = a stored file's id);"
                        + " pass them in 'parameters'. Call stirling_describe_operation for what an"
                        + " option means or when one you need is not shown. Available"
                        + " operations:\n");
        ArrayNode opEnum = op.putArray("enum");
        for (OperationMeta m : enabled) {
            opEnum.add(m.id());
            String signature = McpOperationSignature.of(m.paramSchema());
            opDesc.append("- ").append(m.id());
            if (!signature.isEmpty()) {
                opDesc.append(' ').append(signature);
            }
            if (McpFileParameters.acceptsManyFiles(m.paramSchema())) {
                opDesc.append(" [several files: pass fileIds in order]");
            }
            opDesc.append(" - ").append(m.summary()).append('\n');
        }
        op.put("description", opDesc.toString().trim());

        ObjectNode params = props.putObject("parameters");
        params.put("type", "object");
        params.put("description", "Per-operation parameters, as listed with each operation above.");
        params.put("additionalProperties", true);

        McpInputFiles.inputProperties(props);

        ArrayNode required = schema.putArray("required");
        required.add("operation");
        return schema;
    }

    @Override
    public ObjectNode call(JsonNode arguments, McpCallContext context) {
        JsonNode opNode = arguments == null ? null : arguments.get("operation");
        // No operation chosen: return this category's operation list.
        if (opNode == null || !opNode.isTextual() || opNode.asText().isBlank()) {
            return operationListError(null);
        }
        String opId = opNode.asText();
        McpToolCatalog catalog = catalogProvider.getIfAvailable();
        if (catalog == null) {
            return McpResponses.error(mapper, "MCP catalog is not available");
        }
        OperationMeta meta = catalog.findByOperationId(opId).orElse(null);
        if (meta != null && meta.category() != category()) {
            return McpResponses.error(
                    mapper,
                    opId
                            + " is an operation of "
                            + meta.category().toolName()
                            + ", not "
                            + category().toolName()
                            + ". Call "
                            + meta.category().toolName()
                            + " with the same arguments.");
        }
        // Invalid or disabled op: return this category's operations.
        if (meta == null) {
            return operationListError(opId);
        }
        if (!context.hasScope(meta.requiredScope())) {
            return McpResponses.error(
                    mapper,
                    "Insufficient scope: this operation requires '" + meta.requiredScope() + "'.",
                    McpResponses.Failure.INSUFFICIENT_SCOPE);
        }
        McpOperationExecutor executor = executorProvider.getIfAvailable();
        if (executor == null) {
            return McpResponses.error(mapper, "MCP execution is not available.");
        }
        return executor.execute(meta, arguments, context);
    }

    /**
     * Error for a missing/unknown operation, listing this category's available operation ids and
     * summaries.
     */
    private ObjectNode operationListError(String badOpId) {
        StringBuilder sb = new StringBuilder();
        if (badOpId == null) {
            sb.append("Missing required argument 'operation' for ").append(category().toolName());
        } else {
            sb.append("Unknown or disabled operation '")
                    .append(badOpId)
                    .append("' for ")
                    .append(category().toolName());
        }
        List<OperationMeta> ops = enabledOperations();
        if (ops.isEmpty()) {
            sb.append(". No operations are currently available in this category.");
        } else {
            sb.append(". Available operations:");
            for (OperationMeta m : ops) {
                sb.append("\n- ").append(m.id()).append(" - ").append(m.summary());
            }
            sb.append("\nRe-call this tool with a valid 'operation'.");
        }
        return McpResponses.error(mapper, sb.toString());
    }
}
