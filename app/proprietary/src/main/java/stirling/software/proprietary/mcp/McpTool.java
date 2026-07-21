package stirling.software.proprietary.mcp;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/** Contract every MCP tool registered with the server must satisfy. */
public interface McpTool {

    String name();

    String description();

    /** The tool's {@code inputSchema} (an object JSON Schema) published in {@code tools/list}. */
    ObjectNode inputSchema();

    /** Execute the tool; the controller wraps any thrown exception as an MCP internal error. */
    ObjectNode call(JsonNode arguments, McpCallContext context);
}
