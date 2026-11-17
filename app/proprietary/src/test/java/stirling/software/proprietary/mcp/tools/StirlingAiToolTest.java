package stirling.software.proprietary.mcp.tools;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.catalog.McpToolCatalog;
import stirling.software.proprietary.mcp.catalog.OperationCategory;
import stirling.software.proprietary.mcp.catalog.OperationMeta;
import stirling.software.proprietary.service.AiEngineClient;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

class StirlingAiToolTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final McpToolCatalog catalog = mock(McpToolCatalog.class);
    private final AiEngineClient engineClient = mock(AiEngineClient.class);
    private StirlingAiTool tool;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        ObjectProvider<McpToolCatalog> catalogProvider = mock(ObjectProvider.class);
        when(catalogProvider.getIfAvailable()).thenReturn(catalog);

        ObjectProvider<AiEngineClient> engineProvider = mock(ObjectProvider.class);
        when(engineProvider.getIfAvailable()).thenReturn(engineClient);

        when(catalog.findByOperationId("pdf-question-answer"))
                .thenReturn(
                        Optional.of(
                                new OperationMeta(
                                        "pdf-question-answer",
                                        OperationCategory.AI,
                                        "Answer a question about a PDF",
                                        mapper.createObjectNode(),
                                        "mcp.tools.read",
                                        OperationMeta.Target.JAVA_ENDPOINT,
                                        "/api/v1/pdf/questions",
                                        null)));

        tool = new StirlingAiTool(mapper, catalogProvider, engineProvider);
    }

    @Test
    void call_whenEngineReturnsClientError_returnsToolErrorWithStatusAndSafeMessage()
            throws Exception {
        when(engineClient.post(eq("/api/v1/pdf/questions"), any(), any()))
                .thenThrow(
                        new ResponseStatusException(
                                HttpStatus.NOT_FOUND,
                                "AI engine returned client error (HTTP 404): {\"detail\":\"Not Found\"}"));

        ObjectNode args = mapper.createObjectNode();
        args.put("operation", "pdf-question-answer");
        args.putObject("parameters");

        McpCallContext context = new McpCallContext("user-1", Set.of("mcp.tools.read"), false);
        ObjectNode result = tool.call(args, context);

        assertTrue(result.get("isError").asBoolean());
        String errorText = result.get("content").get(0).get("text").asText();
        assertTrue(errorText.contains("404"));
        assertTrue(errorText.contains("pdf-question-answer"));
        assertTrue(errorText.contains("does not expose this capability"));
        // raw engine detail must never reach the MCP caller
        assertFalse(errorText.contains("AI engine returned client error"));
        assertFalse(errorText.contains("\"detail\""));
    }

    @Test
    void call_whenEngineReturnsServerError_doesNotLeakEngineDetail() throws Exception {
        when(engineClient.post(eq("/api/v1/pdf/questions"), any(), any()))
                .thenThrow(
                        new ResponseStatusException(
                                HttpStatus.INTERNAL_SERVER_ERROR,
                                "AI engine unreachable: internal-engine-host.local"));

        ObjectNode args = mapper.createObjectNode();
        args.put("operation", "pdf-question-answer");

        McpCallContext context = new McpCallContext("user-1", Set.of("mcp.tools.read"), false);
        ObjectNode result = tool.call(args, context);

        assertTrue(result.get("isError").asBoolean());
        String errorText = result.get("content").get(0).get("text").asText();
        assertTrue(errorText.contains("500"));
        assertTrue(errorText.contains("internal error"));
        assertFalse(errorText.contains("internal-engine-host.local"));
    }

    @Test
    void call_whenEngineRejectsAuth_returnsNotAuthorizedMessage() throws Exception {
        when(engineClient.post(eq("/api/v1/pdf/questions"), any(), any()))
                .thenThrow(new ResponseStatusException(HttpStatus.UNAUTHORIZED, "bad api key"));

        ObjectNode args = mapper.createObjectNode();
        args.put("operation", "pdf-question-answer");

        McpCallContext context = new McpCallContext("user-1", Set.of("mcp.tools.read"), false);
        ObjectNode result = tool.call(args, context);

        assertTrue(result.get("isError").asBoolean());
        String errorText = result.get("content").get(0).get("text").asText();
        assertTrue(errorText.contains("401"));
        assertTrue(errorText.contains("not authorized"));
        assertFalse(errorText.contains("bad api key"));
    }

    @Test
    void call_whenEngineThrowsIOException_returnsToolError() throws Exception {
        when(engineClient.post(eq("/api/v1/pdf/questions"), any(), any()))
                .thenThrow(new IOException("Connection refused"));

        ObjectNode args = mapper.createObjectNode();
        args.put("operation", "pdf-question-answer");

        McpCallContext context = new McpCallContext("user-1", Set.of("mcp.tools.read"), false);
        ObjectNode result = tool.call(args, context);

        assertTrue(result.get("isError").asBoolean());
        String errorText = result.get("content").get(0).get("text").asText();
        assertEquals("Engine request failed for capability 'pdf-question-answer'.", errorText);
    }

    @Test
    void call_whenEngineSucceeds_returnsTextResponse() throws Exception {
        when(engineClient.post(eq("/api/v1/pdf/questions"), any(), any()))
                .thenReturn("{\"answer\":\"42\"}");

        ObjectNode args = mapper.createObjectNode();
        args.put("operation", "pdf-question-answer");

        McpCallContext context = new McpCallContext("user-1", Set.of("mcp.tools.read"), false);
        ObjectNode result = tool.call(args, context);

        assertFalse(result.has("isError"));
        assertEquals("{\"answer\":\"42\"}", result.get("content").get(0).get("text").asText());
    }
}
