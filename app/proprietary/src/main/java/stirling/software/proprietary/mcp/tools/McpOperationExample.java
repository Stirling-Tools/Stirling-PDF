package stirling.software.proprietary.mcp.tools;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import stirling.software.proprietary.mcp.catalog.OperationMeta;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** A minimal working call for an operation: required parameters only, filled from the schema. */
final class McpOperationExample {

    private McpOperationExample() {}

    static ObjectNode of(ObjectMapper mapper, OperationMeta meta) {
        ObjectNode example = mapper.createObjectNode();
        example.put("tool", meta.category().toolName());
        ObjectNode arguments = example.putObject("arguments");
        arguments.put("operation", meta.id());
        JsonNode schema = meta.paramSchema();
        boolean manyFiles = McpFileParameters.acceptsManyFiles(schema);
        // An operation that makes a file from parameters alone gets no input in its example.
        boolean takesFile = McpFileParameters.takesFile(meta);
        if (takesFile && manyFiles) {
            arguments.putArray("fileIds").add("<fileId>").add("<fileId>");
        } else if (takesFile) {
            arguments.put("fileId", "<fileId>");
        }
        ObjectNode parameters = arguments.putObject("parameters");
        Set<String> required = new HashSet<>();
        schema.path("required").forEach(r -> required.add(r.asText()));
        for (Map.Entry<String, JsonNode> e : schema.path("properties").properties()) {
            String name = e.getKey();
            if (!required.contains(name) || McpFileParameters.DEFAULT_PART.equals(name)) {
                continue;
            }
            parameters.set(name, sample(mapper, e.getValue()));
        }
        return example;
    }

    /** The schema's default, else its first allowed value, else a placeholder of the right type. */
    private static JsonNode sample(ObjectMapper mapper, JsonNode prop) {
        if (prop.has("default")) {
            return prop.get("default");
        }
        JsonNode values = prop.get("enum");
        if (values != null && values.isArray() && !values.isEmpty()) {
            return values.get(0);
        }
        boolean fileId = "file-id".equals(prop.path("format").asText());
        return switch (prop.path("type").asText()) {
            case "integer" -> mapper.getNodeFactory().numberNode(1);
            case "number" -> mapper.getNodeFactory().numberNode(1.0);
            case "boolean" -> mapper.getNodeFactory().booleanNode(false);
            case "array" -> {
                ArrayNode items = mapper.createArrayNode();
                JsonNode item = prop.path("items");
                items.add(
                        "file-id".equals(item.path("format").asText())
                                ? mapper.getNodeFactory().textNode("<fileId>")
                                : sample(mapper, item));
                yield items;
            }
            case "object" -> mapper.createObjectNode();
            default -> mapper.getNodeFactory().textNode(fileId ? "<fileId>" : "<value>");
        };
    }
}
