package stirling.software.proprietary.mcp.tools;

import java.io.IOException;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.FileStorage;
import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.McpTool;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Stores a file server-side and returns a fileId. For large files or multi-step workflows only -
 * most operations accept the file inline via their {@code file} argument.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class StirlingUploadTool implements McpTool {

    private final ObjectMapper mapper;
    private final FileStorage fileStorage;

    public StirlingUploadTool(ObjectMapper mapper, FileStorage fileStorage) {
        this.mapper = mapper;
        this.fileStorage = fileStorage;
    }

    @Override
    public String name() {
        return "stirling_upload";
    }

    @Override
    public String description() {
        return "Store a file server-side and get back a fileId to reuse across operations."
                + " Recommended only for large files or multi-step workflows; for a single"
                + " operation on a typical file, pass the file inline via the operation's `file`"
                + " argument instead. Argument: { file: <base64>, fileName?: <name> }.";
    }

    @Override
    public ObjectNode inputSchema() {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        schema.put("additionalProperties", false);
        ObjectNode props = schema.putObject("properties");
        McpToolSupport.stringProperty(props, "file", "Base64-encoded file content.");
        McpToolSupport.stringProperty(
                props, "fileName", "Optional original filename (with extension).");
        schema.putArray("required").add("file");
        return schema;
    }

    @Override
    public ObjectNode call(JsonNode arguments, McpCallContext context) {
        if (!context.hasScope("mcp.tools.write")) {
            return McpResponses.error(
                    mapper, "Insufficient scope: stirling_upload requires 'mcp.tools.write'.");
        }
        String base64 = McpToolSupport.textArg(arguments, "file");
        if (base64 == null) {
            return McpResponses.error(
                    mapper, "Missing required argument: file (base64-encoded content).");
        }
        byte[] bytes = McpToolSupport.decodeBase64OrNull(base64);
        if (bytes == null) {
            return McpResponses.error(mapper, "The 'file' argument is not valid base64.");
        }
        String name = McpToolSupport.textArg(arguments, "fileName");
        if (name == null) {
            name = "upload.bin";
        }
        try {
            String fileId = fileStorage.storeBytes(bytes, name);
            return McpResponses.text(
                    mapper,
                    "Stored '"
                            + name
                            + "' ("
                            + bytes.length
                            + " bytes) as fileId="
                            + fileId
                            + ". Pass this fileId to a Stirling operation's 'fileId' argument.");
        } catch (IOException e) {
            log.warn("MCP upload failed to store file", e);
            return McpResponses.error(mapper, "Failed to store the uploaded file.");
        }
    }
}
