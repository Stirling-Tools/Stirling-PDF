package stirling.software.proprietary.mcp.tools;

import java.util.Base64;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/** Shared helpers for MCP tools: argument parsing and JSON-Schema building. */
final class McpToolSupport {

    private McpToolSupport() {}

    /** Trimmed text value of an argument, or null if absent, blank, or not a string. */
    static String textArg(JsonNode args, String field) {
        if (args == null) {
            return null;
        }
        JsonNode node = args.get(field);
        if (node == null || !node.isTextual()) {
            return null;
        }
        String value = node.asText().trim();
        return value.isEmpty() ? null : value;
    }

    /** Decode base64 content, or null if the input is not valid base64. */
    static byte[] decodeBase64OrNull(String base64) {
        try {
            return Base64.getDecoder().decode(base64);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    /**
     * Add a {@code string} property with a description to a JSON-Schema {@code properties} node.
     */
    static void stringProperty(ObjectNode properties, String name, String description) {
        ObjectNode prop = properties.putObject(name);
        prop.put("type", "string");
        prop.put("description", description);
    }
}
