package stirling.software.proprietary.mcp;

import java.util.List;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

/** Contract every MCP tool registered with the server must satisfy. */
public interface McpTool {

    String name();

    String description();

    /** Human-readable display name shown by hosts in tool lists and approval prompts. */
    default String title() {
        return name();
    }

    /** Behaviour hints published as the tool's {@code annotations}; directories require them. */
    McpToolAnnotations annotations();

    /** True when results should render in the in-chat widget (MCP Apps). */
    default boolean rendersWidget() {
        return false;
    }

    /** True when the widget itself calls this tool (ChatGPT {@code openai/widgetAccessible}). */
    default boolean widgetCallable() {
        return false;
    }

    /** Top-level arguments a chat app fills with attached files ({@code openai/fileParams}). */
    default List<String> fileParams() {
        return List.of();
    }

    /** The tool's {@code inputSchema} (an object JSON Schema) published in {@code tools/list}. */
    ObjectNode inputSchema();

    /** Execute the tool; the controller wraps any thrown exception as an MCP internal error. */
    ObjectNode call(JsonNode arguments, McpCallContext context);
}
