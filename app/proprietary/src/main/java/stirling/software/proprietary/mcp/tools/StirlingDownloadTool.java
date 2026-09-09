package stirling.software.proprietary.mcp.tools;

import java.io.IOException;
import java.util.Base64;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.FileStorage;
import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.McpTool;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Fetches a stored file's content by fileId, returned inline as base64. For large results that were
 * not returned inline by an operation.
 */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class StirlingDownloadTool implements McpTool {

    private final ObjectMapper mapper;
    private final FileStorage fileStorage;
    private final ApplicationProperties applicationProperties;

    public StirlingDownloadTool(
            ObjectMapper mapper,
            FileStorage fileStorage,
            ApplicationProperties applicationProperties) {
        this.mapper = mapper;
        this.fileStorage = fileStorage;
        this.applicationProperties = applicationProperties;
    }

    @Override
    public String name() {
        return "stirling_download";
    }

    @Override
    public String description() {
        return "Fetch a stored file's content by fileId (e.g. an operation result), returned inline"
                + " as base64. Recommended only when a result was too large to be returned inline."
                + " Argument: { fileId: <id> }.";
    }

    @Override
    public ObjectNode inputSchema() {
        ObjectNode schema = mapper.createObjectNode();
        schema.put("type", "object");
        schema.put("additionalProperties", false);
        ObjectNode props = schema.putObject("properties");
        McpToolSupport.stringProperty(
                props, "fileId", "Id of a stored file (e.g. an operation result's fileId).");
        schema.putArray("required").add("fileId");
        return schema;
    }

    @Override
    public ObjectNode call(JsonNode arguments, McpCallContext context) {
        if (!context.hasScope("mcp.tools.read")) {
            return McpResponses.error(
                    mapper, "Insufficient scope: stirling_download requires 'mcp.tools.read'.");
        }
        String fileId = McpToolSupport.textArg(arguments, "fileId");
        if (fileId == null) {
            return McpResponses.error(mapper, "Missing required argument: fileId.");
        }
        long maxInline = applicationProperties.getMcp().getMaxInlineResponseBytes();
        try {
            if (!fileStorage.fileExists(fileId)) {
                return McpResponses.error(
                        mapper, "Unknown or inaccessible fileId '" + fileId + "'.");
            }
            long size = fileStorage.getFileSize(fileId);
            if (size > maxInline) {
                return McpResponses.error(
                        mapper,
                        "File is "
                                + size
                                + " bytes, over the inline limit of "
                                + maxInline
                                + " bytes. Raise mcp.maxInlineResponseBytes or retrieve it via the"
                                + " Stirling UI/API.");
            }
            byte[] bytes = fileStorage.retrieveBytes(fileId);
            return McpResponses.result(
                    mapper,
                    false,
                    McpResponses.textBlock(
                            mapper,
                            "File "
                                    + fileId
                                    + " ("
                                    + bytes.length
                                    + " bytes) included inline below."),
                    McpResponses.resourceBlock(
                            mapper,
                            "stirling://file/" + fileId,
                            MediaType.APPLICATION_OCTET_STREAM_VALUE,
                            Base64.getEncoder().encodeToString(bytes)));
        } catch (SecurityException e) {
            return McpResponses.error(mapper, "Unknown or inaccessible fileId '" + fileId + "'.");
        } catch (IOException e) {
            return McpResponses.error(mapper, "Failed to read fileId '" + fileId + "'.");
        }
    }
}
