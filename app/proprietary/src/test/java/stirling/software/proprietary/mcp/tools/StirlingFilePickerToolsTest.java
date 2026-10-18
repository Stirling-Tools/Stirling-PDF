package stirling.software.proprietary.mcp.tools;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.files.McpFileUrlFetcher;
import stirling.software.proprietary.mcp.files.McpFiles;
import stirling.software.proprietary.mcp.files.McpFiles.Listed;
import stirling.software.proprietary.security.model.User;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

class StirlingFilePickerToolsTest {

    private static final Set<String> SCOPES = Set.of("mcp.tools.read", "mcp.tools.write");

    private final ObjectMapper mapper = new ObjectMapper();
    private final McpFiles files = mock(McpFiles.class);
    private final McpFileUrlFetcher fetcher = mock(McpFileUrlFetcher.class);
    private final User user = new User();
    private final Listed report =
            new Listed("42", "report.pdf", "application/pdf", 2048, LocalDateTime.now());

    @BeforeEach
    void setUp() {
        when(files.user(any())).thenReturn(user);
        when(files.usesStoredFiles(user)).thenReturn(true);
        when(files.recent(eq(user), any(), anyInt())).thenReturn(List.of(report));
    }

    @Test
    void selectFile_withChatGptForms_asksWithItsNativeFilePicker() {
        ObjectNode result = select().call(purpose("Compress it"), openAiForms(null));

        assertEquals("input_required", result.get("resultType").asText());
        JsonNode request = result.get("inputRequests").get(StirlingSelectFileTool.INPUT_KEY);
        assertEquals("openai/elicitation/create", request.get("method").asText());
        JsonNode field = request.at("/params/requestedSchema/properties/file");
        assertEquals("uri", field.get("format").asText());
        JsonNode input = field.get("x-openai-input");
        assertEquals("resource", input.get("type").asText());
        assertEquals("stirling://files/42", input.at("/options/0/uri").asText());
        assertEquals("file", input.at("/userOptions/kind").asText());
        assertEquals("Compress it", request.at("/params/message").asText());
    }

    @Test
    void selectFile_returnsTheStoredFileTheUserPicked() {
        when(files.describe(user, "stirling://files/42")).thenReturn(report);

        ObjectNode result = select().call(purpose("x"), openAiForms(accept("stirling://files/42")));

        assertEquals("42", result.at("/structuredContent/fileId").asText());
        assertEquals("selected", result.at("/structuredContent/operation").asText());
        assertTrue(text(result).contains("fileId=42"));
    }

    @Test
    void selectFile_storesAnUploadTheHostHandsOverAsAUrl() throws Exception {
        String url = "https://files.oaiusercontent.com/abc/scan.pdf";
        when(fetcher.fetch(url)).thenReturn(new byte[] {1, 2, 3});
        when(files.save(eq(user), any(byte[].class), eq("scan.pdf"), any(), eq(false)))
                .thenReturn(
                        new McpFiles.Saved(
                                "7", "scan.pdf", "application/pdf", 3, null, null, false, null));

        ObjectNode result = select().call(purpose("x"), openAiForms(accept(url)));

        assertEquals("7", result.at("/structuredContent/fileId").asText());
    }

    @Test
    void selectFile_unreadableChoice_fallsBackToTheWidgetPicker() {
        ObjectNode result =
                select().call(purpose("x"), openAiForms(accept("file:///Users/me/a.pdf")));

        assertEquals("picker", result.at("/structuredContent/kind").asText());
        assertFalse(result.at("/structuredContent/problem").asText().isEmpty());
    }

    @Test
    void selectFile_declined_isNotAnError() {
        ObjectNode declined = mapper.createObjectNode().put("action", "decline");

        ObjectNode result = select().call(purpose("x"), openAiForms(declined));

        assertFalse(result.path("isError").asBoolean(false));
        assertTrue(text(result).contains("without a file"));
    }

    @Test
    void selectFile_openedAsAnEntrypoint_showsTheWidgetWithRecentFiles() {
        ObjectNode result = select().call(mapper.createObjectNode(), openAiForms(null));

        assertEquals("picker", result.at("/structuredContent/kind").asText());
        assertEquals("42", result.at("/structuredContent/files/0/fileId").asText());
    }

    @Test
    void selectFile_withoutChatGptForms_showsTheWidget() {
        McpCallContext plain = new McpCallContext("alice", SCOPES, true);

        ObjectNode result = select().call(purpose("x"), plain);

        assertEquals("picker", result.at("/structuredContent/kind").asText());
    }

    @Test
    void filesTool_listsTheUsersFilesForTheModelAndTheLibraryView() {
        ObjectNode result =
                new StirlingFilesTool(mapper, files)
                        .call(mapper.createObjectNode(), new McpCallContext("alice", SCOPES, true));

        assertEquals("library", result.at("/structuredContent/kind").asText());
        assertEquals("report.pdf", result.at("/structuredContent/files/0/name").asText());
        assertTrue(text(result).contains("report.pdf (2.0 KB, fileId=42)"));
    }

    @Test
    void filesTool_withoutStorage_stillOpensTheLibraryWithAnUpload() {
        when(files.usesStoredFiles(user)).thenReturn(false);

        ObjectNode result =
                new StirlingFilesTool(mapper, files)
                        .call(mapper.createObjectNode(), new McpCallContext("alice", SCOPES, true));

        assertFalse(result.path("isError").asBoolean(false));
        assertEquals(0, result.at("/structuredContent/files").size());
    }

    @Test
    void mentionSearch_returnsResourceLinksTheToolsAcceptAsFileIds() {
        ObjectNode args = mapper.createObjectNode().put("query", "rep");

        ObjectNode result =
                new StirlingMentionFilesTool(mapper, files)
                        .call(args, new McpCallContext("alice", SCOPES, true));

        JsonNode item = result.at("/structuredContent/items/0");
        assertEquals("resource_link", item.get("type").asText());
        assertEquals("stirling://files/42", item.get("uri").asText());
        assertEquals("42", McpFiles.idOf(item.get("uri").asText()));
        assertEquals(0, result.get("content").size());
    }

    @Test
    void mentionSearch_withoutReadScope_findsNothing() {
        ObjectNode result =
                new StirlingMentionFilesTool(mapper, files)
                        .call(
                                mapper.createObjectNode().put("query", ""),
                                new McpCallContext("alice", Set.of(), true));

        assertEquals(0, result.at("/structuredContent/items").size());
    }

    private StirlingSelectFileTool select() {
        return new StirlingSelectFileTool(mapper, files, fetcher);
    }

    private ObjectNode purpose(String purpose) {
        return mapper.createObjectNode().put("purpose", purpose);
    }

    private ObjectNode accept(String uri) {
        ObjectNode answer = mapper.createObjectNode().put("action", "accept");
        answer.putObject("content").put("file", uri);
        return answer;
    }

    private McpCallContext openAiForms(JsonNode answer) {
        ObjectNode caps = mapper.createObjectNode();
        caps.putObject("extensions").putObject("openai/elicitation").putObject("form");
        ObjectNode responses = null;
        if (answer != null) {
            responses = mapper.createObjectNode();
            responses.set(StirlingSelectFileTool.INPUT_KEY, answer);
        }
        return new McpCallContext("alice", SCOPES, true, caps, responses);
    }

    private static String text(ObjectNode result) {
        return result.get("content").get(0).get("text").asText();
    }
}
