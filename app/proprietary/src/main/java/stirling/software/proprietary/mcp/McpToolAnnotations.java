package stirling.software.proprietary.mcp;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** MCP {@code ToolAnnotations} hints that hosts use to decide when to ask the user to confirm. */
public record McpToolAnnotations(
        boolean readOnly, boolean destructive, boolean idempotent, boolean openWorld) {

    /** Reads or describes; never changes anything. */
    public static final McpToolAnnotations READ_ONLY =
            new McpToolAnnotations(true, false, true, false);

    /** Produces a new result file; the user's original is never modified. */
    public static final McpToolAnnotations PRODUCES_FILE =
            new McpToolAnnotations(false, false, false, false);

    /** A {@link #PRODUCES_FILE} variant for tools that can call outside services (URLs, a TSA). */
    public static final McpToolAnnotations PRODUCES_FILE_OPEN_WORLD =
            new McpToolAnnotations(false, false, false, true);

    public ObjectNode toJson(ObjectMapper mapper, String title) {
        ObjectNode node = mapper.createObjectNode();
        node.put("title", title);
        node.put("readOnlyHint", readOnly);
        node.put("destructiveHint", destructive);
        node.put("idempotentHint", idempotent);
        node.put("openWorldHint", openWorld);
        return node;
    }
}
