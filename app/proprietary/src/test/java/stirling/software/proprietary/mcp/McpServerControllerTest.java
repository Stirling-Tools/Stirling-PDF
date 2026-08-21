package stirling.software.proprietary.mcp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.function.Consumer;
import java.util.function.Supplier;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

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

/** Unit test of the MCP server controller: JSON-RPC framing and the 6-tool contract. */
class McpServerControllerTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final McpServerController controller = buildController();

    private McpServerController buildController() {
        ApplicationProperties props = new ApplicationProperties();
        props.getAutomaticallyGenerated().setAppVersion("test-version");
        ObjectProvider<McpToolCatalog> emptyCatalog = emptyProvider();
        ObjectProvider<AiEngineClient> emptyEngine = emptyProvider();
        ObjectProvider<McpOperationExecutor> emptyExecutor = emptyProvider();
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

    private static <T> ObjectProvider<T> emptyProvider() {
        return new ObjectProvider<>() {
            @Override
            public T getObject() {
                throw new UnsupportedOperationException("no bean in unit tests");
            }

            @Override
            public T getObject(Object... args) {
                return getObject();
            }

            @Override
            public T getIfAvailable() {
                return null;
            }

            @Override
            public T getIfUnique() {
                return null;
            }

            @Override
            public T getIfAvailable(Supplier<T> defaultSupplier) {
                return defaultSupplier == null ? null : defaultSupplier.get();
            }

            @Override
            public void ifAvailable(Consumer<T> dependencyConsumer) {}

            @Override
            public Iterator<T> iterator() {
                return java.util.Collections.emptyIterator();
            }
        };
    }

    @Test
    void toolsList_returnsExactlySixTools() throws Exception {
        JsonNode body = mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}");

        ResponseEntity<?> response = controller.handle(body);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode tools = mapper.valueToTree(response.getBody()).get("result").get("tools");
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

        ResponseEntity<?> response = controller.handle(body);

        JsonNode result = mapper.valueToTree(response.getBody()).get("result");
        assertNotNull(result.get("protocolVersion"));
        assertEquals("stirling-pdf-mcp", result.get("serverInfo").get("name").asText());
        assertEquals("test-version", result.get("serverInfo").get("version").asText());
        assertNotNull(result.get("capabilities").get("tools"), "tools capability advertised");
    }

    @Test
    void ping_returnsEmptyResult() throws Exception {
        JsonNode body = mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"ping\"}");

        ResponseEntity<?> response = controller.handle(body);

        JsonNode out = mapper.valueToTree(response.getBody());
        assertEquals(7, out.get("id").asInt());
        assertNotNull(out.get("result"));
        assertNull(out.get("error"));
    }

    @Test
    void notification_returnsNoContentWithEmptyBody() throws Exception {
        // No id field: a JSON-RPC notification gets no response object.
        JsonNode body =
                mapper.readTree("{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}");

        ResponseEntity<?> response = controller.handle(body);

        assertEquals(HttpStatus.NO_CONTENT, response.getStatusCode());
        assertNull(response.getBody());
    }

    @Test
    void unknownMethod_returnsMethodNotFoundError() throws Exception {
        JsonNode body =
                mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"does/not/exist\"}");

        ResponseEntity<?> response = controller.handle(body);

        JsonNode error = mapper.valueToTree(response.getBody()).get("error");
        assertEquals(-32601, error.get("code").asInt());
        assertTrue(error.get("message").asText().contains("does/not/exist"));
    }

    @Test
    void toolsCall_unknownTool_returnsInvalidParams() throws Exception {
        JsonNode body =
                mapper.readTree(
                        "{\"jsonrpc\":\"2.0\",\"id\":4,\"method\":\"tools/call\","
                                + "\"params\":{\"name\":\"stirling_does_not_exist\",\"arguments\":{}}}");

        ResponseEntity<?> response = controller.handle(body);

        JsonNode error = mapper.valueToTree(response.getBody()).get("error");
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

        ResponseEntity<?> response = controller.handle(body);

        JsonNode result = mapper.valueToTree(response.getBody()).get("result");
        assertTrue(result.get("isError").asBoolean());
        String text = result.get("content").get(0).get("text").asText();
        assertTrue(text.toLowerCase().contains("catalog") || text.contains("compress-pdf"));
    }

    @Test
    void wrongShapeJson_returnsInvalidRequest() throws Exception {
        // Valid JSON but not a JSON-RPC request object -> Invalid Request (-32600).
        JsonNode body = mapper.readTree("{\"not\":\"a json-rpc frame\"}");

        ResponseEntity<?> response = controller.handle(body);

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        JsonNode error = mapper.valueToTree(response.getBody()).get("error");
        assertEquals(-32600, error.get("code").asInt());
    }

    @Test
    void initialize_echoesSupportedClientProtocolVersion() throws Exception {
        // Older but supported revision -> server echoes it.
        JsonNode body =
                mapper.readTree(
                        "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\","
                                + "\"params\":{\"protocolVersion\":\"2025-03-26\"}}");

        ResponseEntity<?> response = controller.handle(body);

        JsonNode result = mapper.valueToTree(response.getBody()).get("result");
        assertEquals("2025-03-26", result.get("protocolVersion").asText());
    }

    @Test
    void initialize_unknownClientProtocolVersion_fallsBackToPreferred() throws Exception {
        JsonNode body =
                mapper.readTree(
                        "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\","
                                + "\"params\":{\"protocolVersion\":\"1999-01-01\"}}");

        ResponseEntity<?> response = controller.handle(body);

        JsonNode result = mapper.valueToTree(response.getBody()).get("result");
        assertEquals("2025-06-18", result.get("protocolVersion").asText());
    }
}
