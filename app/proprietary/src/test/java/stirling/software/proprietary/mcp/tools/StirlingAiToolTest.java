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

/** An engine failure reaches the MCP client as a tool error, not a bare JSON-RPC -32603. */
class StirlingAiToolTest {

    private static final String ROUTE = "/api/v1/pdf/questions";

    private final ObjectMapper mapper = new ObjectMapper();
    private final AiEngineClient engine = mock(AiEngineClient.class);
    private final McpCallContext context =
            new McpCallContext("user", Set.of("mcp.tools.read"), true);

    private StirlingAiTool tool() {
        OperationMeta meta =
                new OperationMeta(
                        "pdf-question-answer",
                        OperationCategory.AI,
                        "Answer a question",
                        mapper.createObjectNode(),
                        "mcp.tools.read",
                        OperationMeta.Target.ENGINE_CAPABILITY,
                        ROUTE,
                        null);
        McpToolCatalog catalog = mock(McpToolCatalog.class);
        when(catalog.findByOperationId("pdf-question-answer")).thenReturn(Optional.of(meta));
        @SuppressWarnings("unchecked")
        ObjectProvider<McpToolCatalog> catalogProvider = mock(ObjectProvider.class);
        when(catalogProvider.getIfAvailable()).thenReturn(catalog);
        @SuppressWarnings("unchecked")
        ObjectProvider<AiEngineClient> engineProvider = mock(ObjectProvider.class);
        when(engineProvider.getIfAvailable()).thenReturn(engine);
        return new StirlingAiTool(mapper, catalogProvider, engineProvider);
    }

    private ObjectNode call() {
        ObjectNode args = mapper.createObjectNode();
        args.put("operation", "pdf-question-answer");
        args.putObject("parameters");
        return tool().call(args, context);
    }

    private static String textOf(ObjectNode result) {
        return result.get("content").get(0).get("text").asText();
    }

    @Test
    void engineClientError_isToolErrorCarryingStatusAndDetail() throws IOException {
        when(engine.post(eq(ROUTE), any(), eq("user")))
                .thenThrow(
                        new ResponseStatusException(
                                HttpStatus.UNPROCESSABLE_CONTENT,
                                "AI engine returned client error (HTTP 422): {\"detail\":\"question"
                                        + " missing\"}"));

        ObjectNode result = call();

        assertTrue(result.get("isError").asBoolean());
        String text = textOf(result);
        assertTrue(text.contains("HTTP 422"), text);
        assertTrue(text.contains("question missing"), text);
    }

    @Test
    void engineServerError_isToolErrorWithStatusOnly() throws IOException {
        when(engine.post(eq(ROUTE), any(), eq("user")))
                .thenThrow(
                        new ResponseStatusException(
                                HttpStatus.SERVICE_UNAVAILABLE,
                                "AI engine unreachable: engine.internal:5001 refused"));

        ObjectNode result = call();

        assertTrue(result.get("isError").asBoolean());
        String text = textOf(result);
        assertEquals(
                "Engine request failed for capability 'pdf-question-answer' (HTTP 503).", text);
        assertFalse(text.contains("engine.internal"), text);
    }
}
