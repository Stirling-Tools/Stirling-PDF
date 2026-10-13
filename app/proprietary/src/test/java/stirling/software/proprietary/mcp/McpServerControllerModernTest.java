package stirling.software.proprietary.mcp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.function.Consumer;
import java.util.function.Supplier;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.mcp.catalog.McpToolCatalog;
import stirling.software.proprietary.mcp.tools.DescribeOperationTool;
import stirling.software.proprietary.mcp.tools.McpResponses;
import stirling.software.proprietary.mcp.tools.StirlingSelectFileTool;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** MCP 2026-07-28 requests: per-request _meta, header checks, and decorated results. */
class McpServerControllerModernTest {

    private static final String V = McpModernProtocol.VERSION;

    private final ObjectMapper mapper = new ObjectMapper();
    private final McpServerController controller = build();

    private McpServerController build() {
        ApplicationProperties props = new ApplicationProperties();
        props.getAutomaticallyGenerated().setAppVersion("test-version");
        ObjectProvider<McpToolCatalog> none = emptyProvider();
        return new McpServerController(
                mapper,
                props,
                List.of(
                        new StirlingSelectFileTool(mapper, null, null),
                        new DescribeOperationTool(mapper, none)),
                new McpWidget(mapper, props));
    }

    private ObjectNode request(String method, String version) {
        ObjectNode body = mapper.createObjectNode();
        body.put("jsonrpc", "2.0");
        body.put("id", 7);
        body.put("method", method);
        ObjectNode meta = body.putObject("params").putObject("_meta");
        if (version != null) {
            meta.put(McpModernProtocol.VERSION_KEY, version);
        }
        meta.putObject(McpModernProtocol.CAPABILITIES_KEY);
        meta.putObject("io.modelcontextprotocol/clientInfo").put("name", "t").put("version", "1");
        return body;
    }

    private static HttpHeaders headers(String version, String method, String name) {
        HttpHeaders h = new HttpHeaders();
        if (version != null) h.add(McpModernProtocol.VERSION_HEADER, version);
        if (method != null) h.add(McpModernProtocol.METHOD_HEADER, method);
        if (name != null) h.add(McpModernProtocol.NAME_HEADER, name);
        return h;
    }

    private JsonNode body(ResponseEntity<?> response) {
        return mapper.valueToTree(response.getBody());
    }

    @Test
    void discover_listsBothErasCapabilitiesAndIdentity() {
        ResponseEntity<?> response =
                controller.handle(
                        request("server/discover", V), headers(V, "server/discover", null));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode result = body(response).get("result");
        assertEquals("complete", result.get("resultType").asText());
        List<String> versions = new ArrayList<>();
        result.get("supportedVersions").forEach(v -> versions.add(v.asText()));
        assertEquals(McpModernProtocol.supportedVersions(), versions);
        assertTrue(result.get("capabilities").has("tools"));
        assertEquals(
                "stirling-pdf-mcp",
                result.get("_meta").get(McpModernProtocol.SERVER_INFO_KEY).get("name").asText());
        assertEquals("private", result.get("cacheScope").asText());
        assertTrue(result.get("ttlMs").asLong() > 0);
    }

    @Test
    void toolsList_isSortedAndCacheable() {
        JsonNode result =
                body(controller.handle(request("tools/list", V), headers(V, "tools/list", null)))
                        .get("result");

        assertEquals(
                "stirling_describe_operation", result.get("tools").get(0).get("name").asText());
        assertEquals("stirling_select_file", result.get("tools").get(1).get("name").asText());
        assertEquals("private", result.get("cacheScope").asText());
    }

    @Test
    void toolsCall_resultIsCompleteButNotCacheable() {
        ObjectNode req = request("tools/call", V);
        ((ObjectNode) req.get("params")).put("name", "stirling_describe_operation");

        JsonNode result =
                body(controller.handle(
                                req, headers(V, "tools/call", "stirling_describe_operation")))
                        .get("result");

        assertEquals("complete", result.get("resultType").asText());
        assertNull(result.get("ttlMs"));
    }

    @Test
    void inputRequiredResults_keepTheirTypeAndGetTheClientsAnswersBack() {
        McpTool asking =
                new McpTool() {
                    @Override
                    public String name() {
                        return "asker";
                    }

                    @Override
                    public McpToolAnnotations annotations() {
                        return McpToolAnnotations.READ_ONLY;
                    }

                    @Override
                    public String description() {
                        return "Asks once";
                    }

                    @Override
                    public ObjectNode inputSchema() {
                        return mapper.createObjectNode().put("type", "object");
                    }

                    @Override
                    public ObjectNode call(JsonNode arguments, McpCallContext context) {
                        if (context.canElicitForm() && context.inputResponse("q") == null) {
                            return McpResponses.inputRequired(
                                    mapper, "q", mapper.createObjectNode());
                        }
                        return McpResponses.text(mapper, "answer=" + context.inputResponse("q"));
                    }
                };
        ApplicationProperties props = new ApplicationProperties();
        McpServerController c =
                new McpServerController(
                        mapper, props, List.of(asking), new McpWidget(mapper, props));
        ObjectNode first = request("tools/call", V);
        ((ObjectNode) first.get("params")).put("name", "asker");
        ((ObjectNode) first.get("params").get("_meta"))
                .putObject(McpModernProtocol.CAPABILITIES_KEY)
                .putObject("elicitation");

        JsonNode asked = body(c.handle(first, headers(V, "tools/call", "asker"))).get("result");
        assertEquals("input_required", asked.get("resultType").asText());

        ObjectNode retry = first.deepCopy();
        ((ObjectNode) retry.get("params"))
                .putObject("inputResponses")
                .putObject("q")
                .put("action", "accept");
        JsonNode done = body(c.handle(retry, headers(V, "tools/call", "asker"))).get("result");
        assertEquals("complete", done.get("resultType").asText());
        assertTrue(done.get("content").get(0).get("text").asText().contains("accept"));
    }

    @Test
    void unsupportedVersion_is400WithSupportedList() {
        ResponseEntity<?> response =
                controller.handle(
                        request("tools/list", "2099-01-01"),
                        headers("2099-01-01", "tools/list", null));

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        JsonNode error = body(response).get("error");
        assertEquals(-32022, error.get("code").asInt());
        assertEquals("2099-01-01", error.get("data").get("requested").asText());
        assertEquals(V, error.get("data").get("supported").get(0).asText());
    }

    @Test
    void modernHeaderWithoutMeta_isRejectedAsInvalidParams() {
        ObjectNode req = request("tools/list", null);

        ResponseEntity<?> response = controller.handle(req, headers(V, "tools/list", null));

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals(-32602, body(response).get("error").get("code").asInt());
    }

    @Test
    void missingClientCapabilities_isInvalidParams() {
        ObjectNode req = request("tools/list", V);
        ((ObjectNode) req.get("params").get("_meta")).remove(McpModernProtocol.CAPABILITIES_KEY);

        ResponseEntity<?> response = controller.handle(req, headers(V, "tools/list", null));

        assertEquals(HttpStatus.BAD_REQUEST, response.getStatusCode());
        assertEquals(-32602, body(response).get("error").get("code").asInt());
    }

    @Test
    void headerMismatches_areRejected() {
        assertEquals(
                -32020,
                body(controller.handle(request("tools/list", V), headers(null, "tools/list", null)))
                        .get("error")
                        .get("code")
                        .asInt());
        assertEquals(
                -32020,
                body(controller.handle(request("tools/list", V), headers(V, "prompts/list", null)))
                        .get("error")
                        .get("code")
                        .asInt());
        ObjectNode call = request("tools/call", V);
        ((ObjectNode) call.get("params")).put("name", "stirling_describe_operation");
        ResponseEntity<?> wrongName =
                controller.handle(call, headers(V, "tools/call", "stirling_select_file"));
        assertEquals(HttpStatus.BAD_REQUEST, wrongName.getStatusCode());
        assertEquals(-32020, body(wrongName).get("error").get("code").asInt());
    }

    @Test
    void base64EncodedMcpName_isDecodedBeforeComparing() {
        ObjectNode read = request("resources/read", V);
        ((ObjectNode) read.get("params")).put("uri", McpWidget.URI);
        String encoded =
                "=?base64?"
                        + Base64.getEncoder()
                                .encodeToString(McpWidget.URI.getBytes(StandardCharsets.UTF_8))
                        + "?=";

        ResponseEntity<?> response = controller.handle(read, headers(V, "resources/read", encoded));

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(
                McpWidget.MIME_TYPE,
                body(response).get("result").get("contents").get(0).get("mimeType").asText());
    }

    @Test
    void removedAndUnknownMethods_are404MethodNotFound() {
        for (String method : List.of("ping", "initialize", "nope/nothing")) {
            ResponseEntity<?> response =
                    controller.handle(request(method, V), headers(V, method, null));
            assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode(), method);
            assertEquals(-32601, body(response).get("error").get("code").asInt(), method);
        }
    }

    @Test
    void resourceNotFound_usesInvalidParamsForModernAndLegacyCodeOtherwise() {
        ObjectNode modern = request("resources/read", V);
        ((ObjectNode) modern.get("params")).put("uri", "ui://nope");
        assertEquals(
                -32602,
                body(controller.handle(modern, headers(V, "resources/read", "ui://nope")))
                        .get("error")
                        .get("code")
                        .asInt());

        ObjectNode legacy = mapper.createObjectNode();
        legacy.put("jsonrpc", "2.0").put("id", 1).put("method", "resources/read");
        legacy.putObject("params").put("uri", "ui://nope");
        assertEquals(
                -32002,
                body(controller.handle(legacy, new HttpHeaders()))
                        .get("error")
                        .get("code")
                        .asInt());
    }

    @Test
    void legacyClientsWithAnOldVersionHeader_keepTheOldShape() {
        ObjectNode legacy = mapper.createObjectNode();
        legacy.put("jsonrpc", "2.0").put("id", 1).put("method", "tools/list");
        HttpHeaders h = new HttpHeaders();
        h.add(McpModernProtocol.VERSION_HEADER, "2025-11-25");

        JsonNode result = body(controller.handle(legacy, h)).get("result");

        assertFalse(result.has("resultType"));
        assertFalse(result.has("ttlMs"));
        assertEquals(2, result.get("tools").size());
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
                return Collections.emptyIterator();
            }
        };
    }
}
