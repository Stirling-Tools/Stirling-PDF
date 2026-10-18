package stirling.software.proprietary.mcp.tools;

import java.util.List;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.McpTool;
import stirling.software.proprietary.mcp.McpToolAnnotations;
import stirling.software.proprietary.mcp.files.McpFiles;
import stirling.software.proprietary.security.model.User;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** The user's stored files; ChatGPT also lists it in its sidebar as a file library. */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class StirlingFilesTool implements McpTool {

    static final int LIMIT = 50;

    private final ObjectMapper mapper;
    private final McpFiles files;

    public StirlingFilesTool(ObjectMapper mapper, McpFiles files) {
        this.mapper = mapper;
        this.files = files;
    }

    @Override
    public String name() {
        return "stirling_files";
    }

    @Override
    public String title() {
        return "Your Stirling files";
    }

    @Override
    public McpToolAnnotations annotations() {
        return McpToolAnnotations.READ_ONLY;
    }

    @Override
    public boolean rendersWidget() {
        return true;
    }

    @Override
    public boolean globalEntrypoint() {
        return true;
    }

    @Override
    public String description() {
        return "List the files the user already has in Stirling PDF, newest first, with their"
                + " fileIds. Use it when the user refers to a file they uploaded or produced"
                + " earlier. Pass 'query' to filter by name.";
    }

    @Override
    public ObjectNode inputSchema() {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        schema.put("additionalProperties", false);
        McpToolSupport.stringProperty(
                schema.putObject("properties"),
                "query",
                "Optional text the file name must contain (any case).");
        return schema;
    }

    @Override
    public ObjectNode call(JsonNode arguments, McpCallContext context) {
        if (!context.hasScope("mcp.tools.read")) {
            return McpResponses.error(
                    mapper,
                    "Insufficient scope: listing files requires 'mcp.tools.read'. Reconnect"
                            + " Stirling PDF with read access.",
                    McpResponses.Failure.INSUFFICIENT_SCOPE);
        }
        User user = files.user(context);
        if (!files.usesStoredFiles(user)) {
            // Not an error: the sidebar view still offers an upload.
            ObjectNode result = McpResponses.fileList(mapper, "library", List.of());
            result.set(
                    "content",
                    McpResponses.text(
                                    mapper,
                                    "This Stirling PDF server does not keep files, so there is no"
                                            + " file list. Attach the file or use"
                                            + " stirling_select_file instead.")
                            .get("content"));
            return result;
        }
        String query = McpToolSupport.textArg(arguments, "query");
        return McpResponses.fileList(mapper, "library", files.recent(user, query, LIMIT));
    }
}
