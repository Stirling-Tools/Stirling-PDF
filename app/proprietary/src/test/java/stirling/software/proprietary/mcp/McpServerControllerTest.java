package stirling.software.proprietary.mcp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;

import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

import jakarta.enterprise.inject.Instance;
import jakarta.ws.rs.core.Response;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.mcp.catalog.McpToolCatalog;
import stirling.software.proprietary.mcp.tools.DescribeOperationTool;
import stirling.software.proprietary.mcp.tools.McpOperationExecutor;
import stirling.software.proprietary.mcp.tools.StirlingAiTool;
import stirling.software.proprietary.mcp.tools.StirlingConvertTool;
import stirling.software.proprietary.mcp.tools.StirlingMiscTool;
import stirling.software.proprietary.mcp.tools.StirlingPagesTool;
import stirling.software.proprietary.mcp.tools.StirlingSecurityTool;
import stirling.software.proprietary.service.AiEngineClient;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Unit test of the MCP server controller: JSON-RPC framing and the 6-tool contract.
 *
 * <p>MIGRATION (Spring -> Quarkus): {@code handle(...)} now returns JAX-RS {@link Response} (was
 * {@code ResponseEntity}); status/body accessors are {@code getStatus()}/{@code getEntity()}. Tools
 * are wired with CDI {@code Instance<T>} (was Spring {@code ObjectProvider<T>}); an empty,
 * non-resolvable {@code Instance} mock stands in for the absent collaborators in unit tests.
 */
class McpServerControllerTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final McpServerController controller = buildController();

    private McpServerController buildController() {
        ApplicationProperties props = new ApplicationProperties();
        props.getAutomaticallyGenerated().setAppVersion("test-version");
        Instance<McpToolCatalog> emptyCatalog = emptyInstance();
        Instance<AiEngineClient> emptyEngine = emptyInstance();
        Instance<McpOperationExecutor> emptyExecutor = emptyInstance();
        List<McpTool> tools =
                List.of(
                        new DescribeOperationTool(mapper, emptyCatalog),
                        new StirlingConvertTool(mapper, emptyCatalog, emptyExecutor),
                        new StirlingPagesTool(mapper, emptyCatalog, emptyExecutor),
                        new StirlingMiscTool(mapper, emptyCatalog, emptyExecutor),
                        new StirlingSecurityTool(mapper, emptyCatalog, emptyExecutor),
                        new StirlingAiTool(mapper, emptyCatalog, emptyEngine));
        return new McpServerController(mapper, props, tools);
    }

    @SuppressWarnings("unchecked")
    private static <T> Instance<T> emptyInstance() {
        Instance<T> instance = mock(Instance.class);
        lenient().when(instance.isResolvable()).thenReturn(false);
        lenient().when(instance.isUnsatisfied()).thenReturn(true);
        lenient().when(instance.iterator()).thenReturn(java.util.Collections.emptyIterator());
        return instance;
    }

    @Test
    void toolsList_returnsExactlySixTools() throws Exception {
        JsonNode body = mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}");

        Response response = controller.handle(body);

        assertEquals(Response.Status.OK.getStatusCode(), response.getStatus());
        JsonNode tools = mapper.valueToTree(response.getEntity()).get("result").get("tools");
        assertEquals(6, tools.size(), "tools/list must return exactly 6 tools");

        Set<String> names =
                Set.of(
                        "stirling_describe_operation",
                        "stirling_convert",
                        "stirling_pages",
                        "stirling_misc",
                        "stirling_security",
                        "stirling_ai");
        Set<String> seen = new java.util.HashSet<>();
        tools.forEach(t -> seen.add(t.get("name").asText()));
        assertEquals(names, seen);

        for (JsonNode tool : tools) {
            assertTrue(tool.get("description").asText().length() > 10, "description present");
            assertEquals("object", tool.get("inputSchema").get("type").asText());
        }
    }

    @Test
    void initialize_returnsServerInfoAndProtocolVersion() throws Exception {
        JsonNode body = mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\"}");

        Response response = controller.handle(body);

        JsonNode result = mapper.valueToTree(response.getEntity()).get("result");
        assertNotNull(result.get("protocolVersion"));
        assertEquals("stirling-pdf-mcp", result.get("serverInfo").get("name").asText());
        assertEquals("test-version", result.get("serverInfo").get("version").asText());
        assertNotNull(result.get("capabilities").get("tools"), "tools capability advertised");
    }

    @Test
    void ping_returnsEmptyResult() throws Exception {
        JsonNode body = mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"ping\"}");

        Response response = controller.handle(body);

        JsonNode out = mapper.valueToTree(response.getEntity());
        assertEquals(7, out.get("id").asInt());
        assertNotNull(out.get("result"));
        assertNull(out.get("error"));
    }

    @Test
    void notification_returnsNoContentWithEmptyBody() throws Exception {
        // No id field: a JSON-RPC notification gets no response object.
        JsonNode body =
                mapper.readTree("{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}");

        Response response = controller.handle(body);

        assertEquals(Response.Status.NO_CONTENT.getStatusCode(), response.getStatus());
        assertNull(response.getEntity());
    }

    @Test
    void unknownMethod_returnsMethodNotFoundError() throws Exception {
        JsonNode body =
                mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"does/not/exist\"}");

        Response response = controller.handle(body);

        JsonNode error = mapper.valueToTree(response.getEntity()).get("error");
        assertEquals(-32601, error.get("code").asInt());
        assertTrue(error.get("message").asText().contains("does/not/exist"));
    }

    @Test
    void toolsCall_unknownTool_returnsInvalidParams() throws Exception {
        JsonNode body =
                mapper.readTree(
                        "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\","
                                + "\"params\":{\"name\":\"stirling_does_not_exist\",\"arguments\":{}}}");

        Response response = controller.handle(body);

        JsonNode error = mapper.valueToTree(response.getEntity()).get("error");
        assertEquals(-32602, error.get("code").asInt());
    }

    @Test
    void toolsCall_describeOperation_withoutCatalog_returnsErrorContent() throws Exception {
        // Null catalog: describe must surface an isError content block, not crash.
        JsonNode body =
                mapper.readTree(
                        "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"tools/call\","
                                + "\"params\":{\"name\":\"stirling_describe_operation\","
                                + "\"arguments\":{\"operation\":\"compress-pdf\"}}}");

        Response response = controller.handle(body);

        JsonNode result = mapper.valueToTree(response.getEntity()).get("result");
        assertTrue(result.get("isError").asBoolean());
        String text = result.get("content").get(0).get("text").asText();
        assertTrue(text.toLowerCase().contains("catalog") || text.contains("compress-pdf"));
    }

    @Test
    void wrongShapeJson_returnsInvalidRequest() throws Exception {
        // Valid JSON but not a JSON-RPC request object -> Invalid Request (-32600).
        JsonNode body = mapper.readTree("{\"not\":\"a json-rpc frame\"}");

        Response response = controller.handle(body);

        assertEquals(Response.Status.BAD_REQUEST.getStatusCode(), response.getStatus());
        JsonNode error = mapper.valueToTree(response.getEntity()).get("error");
        assertEquals(-32600, error.get("code").asInt());
    }

    @Test
    void initialize_echoesSupportedClientProtocolVersion() throws Exception {
        // Older but supported revision -> server echoes it.
        JsonNode body =
                mapper.readTree(
                        "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\","
                                + "\"params\":{\"protocolVersion\":\"2025-03-26\"}}");

        Response response = controller.handle(body);

        JsonNode result = mapper.valueToTree(response.getEntity()).get("result");
        assertEquals("2025-03-26", result.get("protocolVersion").asText());
    }

    @Test
    void initialize_unknownClientProtocolVersion_fallsBackToPreferred() throws Exception {
        JsonNode body =
                mapper.readTree(
                        "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\","
                                + "\"params\":{\"protocolVersion\":\"1999-01-01\"}}");

        Response response = controller.handle(body);

        JsonNode result = mapper.valueToTree(response.getEntity()).get("result");
        assertEquals("2025-06-18", result.get("protocolVersion").asText());
    }
}
