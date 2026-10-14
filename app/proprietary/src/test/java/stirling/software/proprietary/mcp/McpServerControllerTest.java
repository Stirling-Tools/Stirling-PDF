package stirling.software.proprietary.mcp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Consumer;
import java.util.function.Supplier;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.common.service.PostHogService;
import stirling.software.proprietary.mcp.catalog.McpToolCatalog;
import stirling.software.proprietary.mcp.catalog.OperationCategory;
import stirling.software.proprietary.mcp.catalog.OperationMeta;
import stirling.software.proprietary.mcp.tools.DescribeOperationTool;
import stirling.software.proprietary.mcp.tools.McpOperationExecutor;
import stirling.software.proprietary.mcp.tools.McpResponses;
import stirling.software.proprietary.mcp.tools.StirlingAiTool;
import stirling.software.proprietary.mcp.tools.StirlingConvertTool;
import stirling.software.proprietary.mcp.tools.StirlingMiscTool;
import stirling.software.proprietary.mcp.tools.StirlingPagesTool;
import stirling.software.proprietary.mcp.tools.StirlingSecurityTool;
import stirling.software.proprietary.service.AiEngineClient;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Unit test of the MCP server controller: JSON-RPC framing and the 6-tool contract. */
class McpServerControllerTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final PostHogService postHog = mock(PostHogService.class);
    private final McpToolCatalog analyticsCatalog = mock(McpToolCatalog.class);
    private McpAnalytics analytics;
    private ApplicationProperties appProps;
    private final McpServerController controller = buildController();

    private McpServerController buildController() {
        ApplicationProperties props = new ApplicationProperties();
        props.getAutomaticallyGenerated().setAppVersion("test-version");
        props.getSystem().setEnableAnalytics(true);
        appProps = props;
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
        @SuppressWarnings("unchecked")
        ObjectProvider<PostHogService> postHogProvider = mock(ObjectProvider.class);
        when(postHogProvider.getIfAvailable()).thenReturn(postHog);
        // Tools see no catalog (error paths); analytics knows compress-pdf only.
        when(analyticsCatalog.findByOperationId("compress-pdf"))
                .thenReturn(
                        Optional.of(
                                new OperationMeta(
                                        "compress-pdf",
                                        OperationCategory.MISC,
                                        "Compress a PDF",
                                        mapper.createObjectNode(),
                                        "mcp.tools.write",
                                        OperationMeta.Target.JAVA_ENDPOINT,
                                        "/api/v1/misc/compress-pdf",
                                        null)));
        @SuppressWarnings("unchecked")
        ObjectProvider<McpToolCatalog> catalogProvider = mock(ObjectProvider.class);
        when(catalogProvider.getIfAvailable()).thenReturn(analyticsCatalog);
        analytics = new McpAnalytics(postHogProvider, catalogProvider, props);
        return new McpServerController(mapper, props, tools, analytics);
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

    @Test
    void toolsList_everyToolHasTitleAndExplicitAnnotations() throws Exception {
        JsonNode body = mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}");

        JsonNode tools =
                mapper.valueToTree(controller.handle(body).getBody()).get("result").get("tools");

        for (JsonNode tool : tools) {
            String name = tool.get("name").asText();
            assertTrue(name.length() <= 64, name);
            assertTrue(tool.hasNonNull("title"), name + " title");
            JsonNode a = tool.get("annotations");
            for (String hint :
                    List.of("readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint")) {
                assertTrue(a.get(hint).isBoolean(), name + " " + hint);
            }
        }
    }

    @Test
    void toolsList_onlyToolsThatReachOutsideServicesAreOpenWorld() throws Exception {
        JsonNode body = mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}");

        JsonNode tools =
                mapper.valueToTree(controller.handle(body).getBody()).get("result").get("tools");

        Set<String> openWorld = Set.of("stirling_convert", "stirling_security");
        for (JsonNode tool : tools) {
            String name = tool.get("name").asText();
            assertEquals(
                    openWorld.contains(name),
                    tool.get("annotations").get("openWorldHint").asBoolean(),
                    name);
        }
    }

    @Test
    void initialize_capturesMcpInitializeEvent() throws Exception {
        JsonNode body =
                mapper.readTree(
                        "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\","
                                + "\"params\":{\"protocolVersion\":\"2025-03-26\","
                                + "\"clientInfo\":{\"name\":\"claude-ai\",\"version\":\"0.1.0\"}}}");

        controller.handle(body);

        Map<String, Object> props = capturedProperties("$mcp_initialize");
        assertEquals("posthog_mcp_analytics", props.get("$mcp_source"));
        assertEquals("claude-ai", props.get("$mcp_client_name"));
        assertEquals("0.1.0", props.get("$mcp_client_version"));
        assertEquals("2025-03-26", props.get("$mcp_protocol_version"));
        assertEquals("test-version", props.get("$mcp_server_version"));
        assertEquals("stirling-pdf-mcp", props.get("$mcp_server_name"));
    }

    @Test
    void toolsCall_capturesToolCallEventWithoutArguments() throws Exception {
        JsonNode body =
                mapper.readTree(
                        "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"tools/call\","
                                + "\"params\":{\"name\":\"stirling_describe_operation\","
                                + "\"arguments\":{\"operation\":\"compress-pdf\",\"secret\":\"x\"}}}");

        controller.handle(body);

        Map<String, Object> props = capturedProperties("$mcp_tool_call");
        assertEquals("stirling_describe_operation", props.get("$mcp_tool_name"));
        assertEquals("compress-pdf", props.get("stirling_operation"));
        assertEquals(true, props.get("$mcp_is_error"));
        assertEquals("tool_error", props.get("$mcp_error_type"));
        assertNull(props.get("$mcp_error_message"), "tool error text is never sent");
        assertEquals("catalog", props.get("$mcp_tool_category"));
        assertNull(props.get("$mcp_tool_description"), "static per version, not sent");
        assertNull(props.get("$mcp_server_version"), "app_version already covers it");
        assertNull(props.get("$mcp_server_name"), "only sent on initialize");
        assertNotNull(props.get("$mcp_duration_ms"));
        assertNull(props.get("$mcp_parameters"), "arguments must never be sent");
    }

    @AfterEach
    void clearContexts() {
        SecurityContextHolder.clearContext();
        RequestContextHolder.resetRequestAttributes();
    }

    @Test
    void dailyUsers_sendsDistinctCountsPerAuthMethodOnly() throws Exception {
        callToolsListAs("Alice@Example.com", "api_key");
        callToolsListAs("alice@example.com", "api_key");
        callToolsListAs("bob", "oauth");

        analytics.flushDailyUsers();

        Map<String, Object> props = capturedProperties("mcp_daily_users");
        assertEquals(2, props.get("distinct_users"));
        assertEquals(1, props.get("distinct_users_api_key"));
        assertEquals(1, props.get("distinct_users_oauth"));
        assertTrue(!props.toString().toLowerCase().contains("alice"), "no usernames sent");

        reset(postHog);
        analytics.flushDailyUsers();
        verify(postHog, never()).captureEvent(eq("mcp_daily_users"), anyMap());
    }

    private void callToolsListAs(String username, String authMethod) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setAttribute(McpAnalytics.AUTH_METHOD_ATTRIBUTE, authMethod);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new UsernamePasswordAuthenticationToken(username, null, List.of()));
        controller.handle(
                mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}"));
        assertEquals(authMethod, capturedLast("$mcp_tools_list").get("stirling_auth_method"));
    }

    @Test
    void analyticsDisabled_sendsNothingAndDropsDailyUsers() throws Exception {
        appProps.getSystem().setEnableAnalytics(false);
        MockHttpServletRequest request = new MockHttpServletRequest();
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        SecurityContextHolder.getContext()
                .setAuthentication(
                        new UsernamePasswordAuthenticationToken("alice", null, List.of()));
        controller.handle(
                mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}"));

        appProps.getSystem().setEnableAnalytics(true);
        analytics.flushDailyUsers();

        verify(postHog, never()).captureEvent(org.mockito.ArgumentMatchers.anyString(), anyMap());
    }

    @Test
    void initialize_issuesSessionIdThatLaterCallsCarryWithClientInfo() throws Exception {
        RequestContextHolder.setRequestAttributes(
                new ServletRequestAttributes(new MockHttpServletRequest()));
        ResponseEntity<?> init =
                controller.handle(
                        mapper.readTree(
                                "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\","
                                        + "\"params\":{\"clientInfo\":{\"name\":\"claude-ai\","
                                        + "\"version\":\"0.1.0\"}}}"));
        String sessionId = init.getHeaders().getFirst(McpAnalytics.SESSION_HEADER);
        assertNotNull(sessionId);
        assertTrue(sessionId.matches("ses_[0-9a-f]{32}"));
        assertEquals(sessionId, capturedProperties("$mcp_initialize").get("$session_id"));

        MockHttpServletRequest next = new MockHttpServletRequest();
        next.addHeader(McpAnalytics.SESSION_HEADER, sessionId);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(next));
        controller.handle(
                mapper.readTree(
                        "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\","
                                + "\"params\":{\"name\":\"stirling_describe_operation\"}}"));

        Map<String, Object> props = capturedProperties("$mcp_tool_call");
        assertEquals(sessionId, props.get("$session_id"));
        assertEquals("claude-ai", props.get("$mcp_client_name"));
        assertEquals("0.1.0", props.get("$mcp_client_version"));
    }

    @Test
    void initialize_noSessionIdWhenAnalyticsDisabled() throws Exception {
        appProps.getSystem().setEnableAnalytics(false);
        ResponseEntity<?> init =
                controller.handle(
                        mapper.readTree(
                                "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\"}"));
        assertNull(init.getHeaders().getFirst(McpAnalytics.SESSION_HEADER));
    }

    @Test
    void forgedSessionHeader_isIgnored() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(McpAnalytics.SESSION_HEADER, "user@example.com");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        controller.handle(
                mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}"));
        assertNull(capturedProperties("$mcp_tools_list").get("$session_id"));
    }

    @Test
    void userAgent_isNotSent() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("User-Agent", "client/1.0 (alice@example.com)");
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        controller.handle(
                mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}"));

        Map<String, Object> props = capturedProperties("$mcp_tools_list");
        assertNull(props.get("$mcp_client_user_agent"));
        assertTrue(!props.toString().contains("alice"), "user agent must not be sent");
    }

    @Test
    void toolError_sendsFlagButNoMessage() throws Exception {
        McpServerController single =
                controllerWith(
                        args ->
                                McpResponses.error(
                                        mapper, "Cannot open /srv/data/acme-contract.pdf"));
        single.handle(toolCall("fake_tool"));

        Map<String, Object> props = capturedProperties("$mcp_tool_call");
        assertEquals(true, props.get("$mcp_is_error"));
        assertEquals("tool_error", props.get("$mcp_error_type"));
        assertNull(props.get("$mcp_error_message"));
        assertTrue(!props.toString().contains("acme-contract"), "error text must not be sent");
        assertEquals("test", props.get("$mcp_tool_category"));
    }

    @Test
    void toolCall_operationOutsideCatalog_isNotSent() throws Exception {
        controller.handle(
                mapper.readTree(
                        "{\"jsonrpc\":\"2.0\",\"id\":5,\"method\":\"tools/call\","
                                + "\"params\":{\"name\":\"stirling_describe_operation\","
                                + "\"arguments\":{\"operation\":\"john smith contract\"}}}"));

        Map<String, Object> props = capturedProperties("$mcp_tool_call");
        assertNull(props.get("stirling_operation"));
        assertTrue(!props.toString().contains("john smith"), "free text must not be sent");
    }

    @Test
    void toolException_sendsExceptionTypeOnly() throws Exception {
        McpServerController single =
                controllerWith(
                        args -> {
                            throw new IllegalStateException("contains secret.pdf");
                        });
        ResponseEntity<?> response = single.handle(toolCall("fake_tool"));
        assertNotNull(mapper.valueToTree(response.getBody()).get("error"));

        Map<String, Object> call = capturedProperties("$mcp_tool_call");
        assertEquals("exception", call.get("$mcp_error_type"));
        assertEquals("IllegalStateException", call.get("$mcp_error_message"));
        assertTrue(!call.toString().contains("secret.pdf"), "message must not be sent");
        verify(postHog, never()).captureEvent(eq("$exception"), anyMap());
    }

    private JsonNode toolCall(String name) throws Exception {
        return mapper.readTree(
                "{\"jsonrpc\":\"2.0\",\"id\":9,\"method\":\"tools/call\","
                        + "\"params\":{\"name\":\""
                        + name
                        + "\",\"arguments\":{}}}");
    }

    private McpServerController controllerWith(
            java.util.function.Function<JsonNode, ObjectNode> body) {
        McpTool tool =
                new McpTool() {
                    @Override
                    public String name() {
                        return "fake_tool";
                    }

                    @Override
                    public String description() {
                        return "Fake tool for analytics tests";
                    }

                    @Override
                    public McpToolAnnotations annotations() {
                        return McpToolAnnotations.READ_ONLY;
                    }

                    @Override
                    public String analyticsCategory() {
                        return "test";
                    }

                    @Override
                    public ObjectNode inputSchema() {
                        return mapper.createObjectNode().put("type", "object");
                    }

                    @Override
                    public ObjectNode call(JsonNode arguments, McpCallContext context) {
                        return body.apply(arguments);
                    }
                };
        return new McpServerController(mapper, appProps, List.of(tool), analytics);
    }

    @Test
    void anonymousCall_reportsNoAuth() throws Exception {
        controller.handle(
                mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}"));

        Map<String, Object> props = capturedProperties("$mcp_tools_list");
        assertEquals("none", props.get("stirling_auth_method"));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> capturedLast(String event) {
        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(postHog, atLeastOnce()).captureEvent(eq(event), captor.capture());
        return captor.getValue();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> capturedProperties(String event) {
        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(postHog).captureEvent(eq(event), captor.capture());
        return captor.getValue();
    }
}
