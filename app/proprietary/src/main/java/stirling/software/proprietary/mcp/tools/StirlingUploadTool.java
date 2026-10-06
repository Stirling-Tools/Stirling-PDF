package stirling.software.proprietary.mcp.tools;

import java.util.List;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.stereotype.Component;

import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.McpTool;
import stirling.software.proprietary.mcp.McpToolAnnotations;
import stirling.software.proprietary.mcp.files.McpFileUrlFetcher;
import stirling.software.proprietary.mcp.files.McpFiles;
import stirling.software.proprietary.security.model.User;
import stirling.software.proprietary.storage.model.StoredFile;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Stores a temporary file server-side and returns its fileId. Fed by chat attachments, the in-chat
 * file picker, or base64 from clients that can send it.
 */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class StirlingUploadTool implements McpTool {

    private final ObjectMapper mapper;
    private final McpFiles files;
    private final McpFileUrlFetcher fileUrlFetcher;

    public StirlingUploadTool(
            ObjectMapper mapper, McpFiles files, McpFileUrlFetcher fileUrlFetcher) {
        this.mapper = mapper;
        this.files = files;
        this.fileUrlFetcher = fileUrlFetcher;
    }

    @Override
    public String name() {
        return "stirling_upload";
    }

    @Override
    public String title() {
        return "Upload a file";
    }

    @Override
    public McpToolAnnotations annotations() {
        return McpToolAnnotations.PRODUCES_FILE;
    }

    @Override
    public List<String> fileParams() {
        return List.of(McpInputFiles.ATTACHMENT_ARG);
    }

    @Override
    public String description() {
        return "Store a file on the Stirling PDF server and get back a fileId that any Stirling"
                + " tool accepts. Use it to keep one file across several operations. Provide the"
                + " file as a chat attachment (inputFile) or as base64 (file).";
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
        McpInputFiles.attachmentProperty(props);
        return schema;
    }

    @Override
    public ObjectNode call(JsonNode arguments, McpCallContext context) {
        if (!context.hasScope("mcp.tools.write")) {
            return McpResponses.error(
                    mapper, "Insufficient scope: stirling_upload requires 'mcp.tools.write'.");
        }
        if (McpToolSupport.textArg(arguments, "fileId") != null) {
            return McpResponses.error(mapper, "That file is already stored; reuse its fileId.");
        }
        try {
            User user = files.user(context);
            McpInputFiles.Input input =
                    McpInputFiles.resolve(arguments, files, user, fileUrlFetcher, "upload.bin");
            if (input.error() != null) {
                return McpResponses.error(mapper, input.error());
            }
            String type =
                    MediaTypeFactory.getMediaType(input.name())
                            .map(Object::toString)
                            .orElse(MediaType.APPLICATION_OCTET_STREAM_VALUE);
            StoredFile stored = files.store(user, input.bytes(), input.name(), type);
            return McpResponses.storedFile(mapper, "upload", stored, null);
        } catch (McpFiles.McpFileException e) {
            return McpResponses.error(mapper, e.getMessage());
        }
    }
}
