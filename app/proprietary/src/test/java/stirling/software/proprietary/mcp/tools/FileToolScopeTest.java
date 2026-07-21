package stirling.software.proprietary.mcp.tools;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

import java.util.Set;

import org.junit.jupiter.api.Test;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.FileStorage;
import stirling.software.proprietary.mcp.McpCallContext;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** stirling_upload requires write scope; stirling_download requires read scope. */
class FileToolScopeTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private McpCallContext noScopes() {
        return new McpCallContext("user", Set.of(), true);
    }

    private String text(ObjectNode result) {
        return result.get("content").get(0).get("text").asText();
    }

    @Test
    void upload_withoutWriteScope_isRefused() {
        StirlingUploadTool tool = new StirlingUploadTool(mapper, mock(FileStorage.class));
        ObjectNode args = mapper.createObjectNode();
        args.put("file", "YWJj");

        ObjectNode result = tool.call(args, noScopes());

        assertTrue(result.path("isError").asBoolean(false));
        assertTrue(text(result).toLowerCase().contains("scope"));
    }

    @Test
    void download_withoutReadScope_isRefused() {
        StirlingDownloadTool tool =
                new StirlingDownloadTool(
                        mapper, mock(FileStorage.class), new ApplicationProperties());
        ObjectNode args = mapper.createObjectNode();
        args.put("fileId", "abc");

        ObjectNode result = tool.call(args, noScopes());

        assertTrue(result.path("isError").asBoolean(false));
        assertTrue(text(result).toLowerCase().contains("scope"));
    }
}
