package stirling.software.proprietary.mcp.tools;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.McpTool;
import stirling.software.proprietary.mcp.McpToolAnnotations;
import stirling.software.proprietary.mcp.files.McpFiles;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Composer @-mention search over the user's files (OpenAI {@code mentions/search}). */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class StirlingMentionFilesTool implements McpTool {

    static final int LIMIT = 20;

    private final ObjectMapper mapper;
    private final McpFiles files;

    public StirlingMentionFilesTool(ObjectMapper mapper, McpFiles files) {
        this.mapper = mapper;
        this.files = files;
    }

    @Override
    public String name() {
        return "stirling_mention_files";
    }

    @Override
    public String title() {
        return "Find a Stirling file";
    }

    @Override
    public McpToolAnnotations annotations() {
        return McpToolAnnotations.READ_ONLY;
    }

    @Override
    public boolean mentionSearch() {
        return true;
    }

    @Override
    public String description() {
        return "Search the user's Stirling PDF files by name for an @-mention. Each result's URI"
                + " can be passed to other Stirling tools as a fileId.";
    }

    @Override
    public ObjectNode inputSchema() {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        McpToolSupport.stringProperty(
                schema.putObject("properties"), "query", "Search text, which may be empty.");
        schema.putArray("required").add("query");
        return schema;
    }

    @Override
    public ObjectNode call(JsonNode arguments, McpCallContext context) {
        ObjectNode result = mapper.createObjectNode();
        result.putArray("content");
        ArrayNode items = result.putObject("structuredContent").putArray("items");
        if (!context.hasScope("mcp.tools.read")) {
            return result;
        }
        String query = McpToolSupport.textArg(arguments, "query");
        for (McpFiles.Listed f : files.recent(files.user(context), query, LIMIT)) {
            ObjectNode link = items.addObject();
            link.put("type", "resource_link");
            link.put("uri", f.uri());
            link.put("name", f.name());
            link.put("description", McpResponses.humanSize(f.size()));
            if (f.contentType() != null) {
                link.put("mimeType", f.contentType());
            }
        }
        return result;
    }
}
