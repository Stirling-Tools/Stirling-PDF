package stirling.software.proprietary.mcp.tools;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.McpTool;
import stirling.software.proprietary.mcp.McpToolAnnotations;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** In-chat file picker; the widget uploads to stirling_upload so bytes skip the model. */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class StirlingSelectFileTool implements McpTool {

    private final ObjectMapper mapper;

    public StirlingSelectFileTool(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public String name() {
        return "stirling_select_file";
    }

    @Override
    public String title() {
        return "Choose a file from your device";
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
    public String description() {
        return "Show a file picker in the chat so the user can send a PDF, image or office"
                + " document from their device to Stirling PDF. Use this when the user wants a"
                + " file processed but it has no Stirling fileId yet and no attachment is"
                + " available. The user's choice comes back as a new message containing the"
                + " fileId.";
    }

    @Override
    public ObjectNode inputSchema() {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        schema.put("additionalProperties", false);
        ObjectNode props = schema.putObject("properties");
        McpToolSupport.stringProperty(
                props,
                "purpose",
                "Short description of what will be done with the file, shown to the user"
                        + " (e.g. 'Compress to under 5 MB').");
        return schema;
    }

    @Override
    public ObjectNode call(JsonNode arguments, McpCallContext context) {
        if (!context.hasScope("mcp.tools.write")) {
            return McpResponses.error(
                    mapper,
                    "Insufficient scope: uploading a file requires 'mcp.tools.write'. Reconnect"
                            + " Stirling PDF with write access.");
        }
        String purpose = McpToolSupport.textArg(arguments, "purpose");
        ObjectNode result =
                McpResponses.text(
                        mapper,
                        "A file picker is shown to the user. Wait for their next message, which"
                                + " will include the fileId of the file they chose.");
        ObjectNode structured = mapper.createObjectNode();
        structured.put("kind", "picker");
        if (purpose != null) {
            structured.put("purpose", purpose);
        }
        result.set("structuredContent", structured);
        return result;
    }
}
