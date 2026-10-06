package stirling.software.proprietary.mcp.tools;

import java.util.Base64;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.stereotype.Component;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.McpTool;
import stirling.software.proprietary.mcp.McpToolAnnotations;
import stirling.software.proprietary.mcp.files.McpFiles;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Returns a stored file inline as base64, for clients that cannot open a link. */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class StirlingDownloadTool implements McpTool {

    private final ObjectMapper mapper;
    private final McpFiles files;
    private final ApplicationProperties applicationProperties;

    public StirlingDownloadTool(
            ObjectMapper mapper, McpFiles files, ApplicationProperties applicationProperties) {
        this.mapper = mapper;
        this.files = files;
        this.applicationProperties = applicationProperties;
    }

    @Override
    public String name() {
        return "stirling_download";
    }

    @Override
    public String title() {
        return "Download a result file";
    }

    @Override
    public McpToolAnnotations annotations() {
        return McpToolAnnotations.READ_ONLY;
    }

    @Override
    public String description() {
        return "Fetch a stored file's content by fileId (e.g. an operation result), returned inline"
                + " as base64. Only for clients that cannot open the result's download link."
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
            McpFiles.Loaded file = files.load(files.user(context), fileId);
            if (file.bytes().length > maxInline) {
                return McpResponses.error(
                        mapper,
                        "File is "
                                + file.bytes().length
                                + " bytes, over the inline limit of "
                                + maxInline
                                + " bytes. Use the result's download link instead.");
            }
            return McpResponses.result(
                    mapper,
                    false,
                    McpResponses.textBlock(
                            mapper,
                            "File "
                                    + fileId
                                    + " ("
                                    + file.bytes().length
                                    + " bytes) included inline below."),
                    McpResponses.resourceBlock(
                            mapper,
                            "stirling://file/" + fileId,
                            MediaTypeFactory.getMediaType(file.name())
                                    .orElse(MediaType.APPLICATION_OCTET_STREAM)
                                    .toString(),
                            Base64.getEncoder().encodeToString(file.bytes())));
        } catch (McpFiles.McpFileException e) {
            return McpResponses.error(mapper, e.getMessage());
        }
    }
}
