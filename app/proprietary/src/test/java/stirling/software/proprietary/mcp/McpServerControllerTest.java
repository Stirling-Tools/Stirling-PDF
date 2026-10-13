package stirling.software.proprietary.mcp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
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
import stirling.software.proprietary.mcp.tools.McpOperationExecutor;
import stirling.software.proprietary.mcp.tools.StirlingAiTool;
import stirling.software.proprietary.mcp.tools.StirlingConvertTool;
import stirling.software.proprietary.mcp.tools.StirlingFilesTool;
import stirling.software.proprietary.mcp.tools.StirlingMentionFilesTool;
import stirling.software.proprietary.mcp.tools.StirlingMiscTool;
import stirling.software.proprietary.mcp.tools.StirlingPagesTool;
import stirling.software.proprietary.mcp.tools.StirlingSecurityTool;
import stirling.software.proprietary.mcp.tools.StirlingSelectFileTool;
import stirling.software.proprietary.mcp.tools.StirlingUploadTool;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Unit test of the MCP server controller: JSON-RPC framing and the 6-tool contract. */
class McpServerControllerTest {

    private final ObjectMapper mapper = new ObjectMapper();
    private final McpServerController controller = buildController();

    private McpServerController buildController() {
        ApplicationProperties props = new ApplicationProperties();
        props.getAutomaticallyGenerated().setAppVersion("test-version");
        ObjectProvider<McpToolCatalog> emptyCatalog = emptyProvider();
        ObjectProvider<McpOperationExecutor> emptyExecutor = emptyProvider();
        List<McpTool> tools =
                List.of(
                        new DescribeOperationTool(mapper, emptyCatalog),
                        new StirlingConvertTool(mapper, emptyCatalog, emptyExecutor),
                        new StirlingPagesTool(mapper, emptyCatalog, emptyExecutor),
                        new StirlingMiscTool(mapper, emptyCatalog, emptyExecutor),
                        new StirlingSecurityTool(mapper, emptyCatalog, emptyExecutor),
                        new StirlingAiTool(mapper, emptyCatalog, emptyExecutor));
        return new McpServerController(mapper, props, tools, new McpWidget(mapper, props));
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
    void toolsList_listsTheCategoryToolsAndHidesAiWithoutAnEngine() throws Exception {
        JsonNode body = mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}");

        ResponseEntity<?> response = controller.handle(body, new HttpHeaders());

        assertEquals(HttpStatus.OK, response.getStatusCode());
        JsonNode tools = mapper.valueToTree(response.getBody()).get("result").get("tools");
        // No engine in this test, so stirling_ai has no capabilities and is left out.
        assertEquals(5, tools.size());

        Set<String> names =
                Set.of(
                        "stirling_describe_operation",
                        "stirling_convert",
                        "stirling_pages",
                        "stirling_misc",
                        "stirling_security");
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

        ResponseEntity<?> response = controller.handle(body, new HttpHeaders());

        JsonNode result = mapper.valueToTree(response.getBody()).get("result");
        assertNotNull(result.get("protocolVersion"));
        assertEquals("stirling-pdf-mcp", result.get("serverInfo").get("name").asText());
        assertEquals("test-version", result.get("serverInfo").get("version").asText());
        assertNotNull(result.get("capabilities").get("tools"), "tools capability advertised");
        String instructions = result.get("instructions").asText();
        assertTrue(instructions.contains("stirling_describe_operation"));
        assertTrue(instructions.contains("\n- Chain steps"), "one hint per line");
        assertFalse(instructions.contains("stirling_files"), "only names tools that are listed");
    }

    @Test
    void plainClientsAreToldToShareLinksAndAskForPasswords() throws Exception {
        JsonNode body =
                mapper.readTree(
                        "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":"
                                + "{\"protocolVersion\":\"2025-06-18\",\"capabilities\":{}}}");

        String instructions =
                mapper.valueToTree(controller.handle(body, new HttpHeaders()).getBody())
                        .get("result")
                        .get("instructions")
                        .asText();

        assertTrue(instructions.contains("ask the user for it"), instructions);
        assertFalse(instructions.contains("Never ask the user"), instructions);
        assertFalse(instructions.contains("Results appear as a card"), instructions);
    }

    @Test
    void appClientsWithFormsKeepPasswordsAndLinksOutOfTheChat() {
        JsonNode caps =
                mapper.createObjectNode()
                        .<tools.jackson.databind.node.ObjectNode>set(
                                "elicitation", mapper.createObjectNode())
                        .set(
                                "extensions",
                                mapper.createObjectNode()
                                        .set(
                                                "io.modelcontextprotocol/ui",
                                                mapper.createObjectNode()));

        String instructions = controller.instructions(caps, true);

        assertTrue(instructions.contains("Never ask the user"), instructions);
        assertTrue(instructions.contains("Results appear as a card"), instructions);
    }

    @Test
    void ping_returnsEmptyResult() throws Exception {
        JsonNode body = mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":7,\"method\":\"ping\"}");

        ResponseEntity<?> response = controller.handle(body, new HttpHeaders());

        JsonNode out = mapper.valueToTree(response.getBody());
        assertEquals(7, out.get("id").asInt());
        assertNotNull(out.get("result"));
        assertNull(out.get("error"));
    }

    @Test
    void notification_returnsAcceptedWithEmptyBody() throws Exception {
        // No id field: a JSON-RPC notification gets no response object.
        JsonNode body =
                mapper.readTree("{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}");

        ResponseEntity<?> response = controller.handle(body, new HttpHeaders());

        assertEquals(HttpStatus.ACCEPTED, response.getStatusCode());
        assertNull(response.getBody());
    }

    @Test
    void unknownMethod_returnsMethodNotFoundError() throws Exception {
        JsonNode body =
                mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"does/not/exist\"}");

        ResponseEntity<?> response = controller.handle(body, new HttpHeaders());

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

        ResponseEntity<?> response = controller.handle(body, new HttpHeaders());

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

        ResponseEntity<?> response = controller.handle(body, new HttpHeaders());

        JsonNode result = mapper.valueToTree(response.getBody()).get("result");
        assertTrue(result.get("isError").asBoolean());
        String text = result.get("content").get(0).get("text").asText();
        assertTrue(text.toLowerCase().contains("catalog") || text.contains("compress-pdf"));
    }

    @Test
    void wrongShapeJson_returnsInvalidRequest() throws Exception {
        // Valid JSON but not a JSON-RPC request object -> Invalid Request (-32600).
        JsonNode body = mapper.readTree("{\"not\":\"a json-rpc frame\"}");

        ResponseEntity<?> response = controller.handle(body, new HttpHeaders());

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

        ResponseEntity<?> response = controller.handle(body, new HttpHeaders());

        JsonNode result = mapper.valueToTree(response.getBody()).get("result");
        assertEquals("2025-03-26", result.get("protocolVersion").asText());
    }

    @Test
    void initialize_unknownClientProtocolVersion_fallsBackToPreferred() throws Exception {
        JsonNode body =
                mapper.readTree(
                        "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\","
                                + "\"params\":{\"protocolVersion\":\"1999-01-01\"}}");

        ResponseEntity<?> response = controller.handle(body, new HttpHeaders());

        JsonNode result = mapper.valueToTree(response.getBody()).get("result");
        assertEquals("2025-06-18", result.get("protocolVersion").asText());
    }

    @Test
    void toolsList_everyToolHasTitleAndExplicitAnnotations() throws Exception {
        JsonNode body = mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}");

        JsonNode tools =
                mapper.valueToTree(controller.handle(body, new HttpHeaders()).getBody())
                        .get("result")
                        .get("tools");

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
    void toolsList_categoryToolsLinkWidgetAndDeclareFileParams() throws Exception {
        JsonNode body = mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}");

        JsonNode tools =
                mapper.valueToTree(controller.handle(body, new HttpHeaders()).getBody())
                        .get("result")
                        .get("tools");

        JsonNode convert = null;
        JsonNode describe = null;
        for (JsonNode t : tools) {
            if (t.get("name").asText().equals("stirling_convert")) convert = t;
            if (t.get("name").asText().equals("stirling_describe_operation")) describe = t;
        }
        assertEquals(McpWidget.URI, convert.get("_meta").get("ui").get("resourceUri").asText());
        assertEquals(McpWidget.URI, convert.get("_meta").get("openai/outputTemplate").asText());
        assertEquals("inputFile", convert.get("_meta").get("openai/fileParams").get(0).asText());
        assertEquals(
                "object",
                convert.get("inputSchema").get("properties").get("inputFile").get("type").asText());
        assertTrue(describe.get("annotations").get("readOnlyHint").asBoolean());
        assertNull(describe.get("_meta"), "read-only describe has no widget");
    }

    @Test
    void initialize_advertisesResourcesAndAppsExtension() throws Exception {
        JsonNode body = mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\"}");

        JsonNode caps =
                mapper.valueToTree(controller.handle(body, new HttpHeaders()).getBody())
                        .get("result")
                        .get("capabilities");

        assertNotNull(caps.get("resources"));
        assertEquals(
                McpWidget.MIME_TYPE,
                caps.get("extensions")
                        .get("io.modelcontextprotocol/ui")
                        .get("mimeTypes")
                        .get(0)
                        .asText());
    }

    @Test
    void resourcesRead_returnsWidgetHtml() throws Exception {
        JsonNode body =
                mapper.readTree(
                        "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"resources/read\",\"params\":{\"uri\":\""
                                + McpWidget.URI
                                + "\"}}");

        JsonNode content =
                mapper.valueToTree(controller.handle(body, new HttpHeaders()).getBody())
                        .get("result")
                        .get("contents")
                        .get(0);

        assertEquals(McpWidget.MIME_TYPE, content.get("mimeType").asText());
        assertTrue(content.get("text").asText().contains("ui/initialize"));
        assertNotNull(content.get("_meta").get("ui").get("csp"));
    }

    @Test
    void resourcesRead_unknownUri_returnsNotFound() throws Exception {
        JsonNode body =
                mapper.readTree(
                        "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"resources/read\",\"params\":{\"uri\":\"ui://nope\"}}");

        JsonNode error =
                mapper.valueToTree(controller.handle(body, new HttpHeaders()).getBody())
                        .get("error");

        assertEquals(-32002, error.get("code").asInt());
    }

    @Test
    void widgetDomain_isFrontendOriginThenBackendOrigin() {
        ApplicationProperties props = new ApplicationProperties();
        McpWidget widget = new McpWidget(mapper, props);
        assertNull(widget.widgetDomain());

        props.getSystem().setBackendUrl("https://api.example.com/");
        assertEquals("https://api.example.com", widget.widgetDomain());

        props.getSystem().setFrontendUrl("https://example.com/app");
        assertEquals("https://example.com", widget.widgetDomain());
    }

    @Test
    void widgetAndAttachmentsOff_dropWidgetMetaPickerAndFileParams() throws Exception {
        ApplicationProperties props = new ApplicationProperties();
        props.getMcp().setWidgetEnabled(false);
        props.getMcp().setFileUrlAllowedHosts(List.of());
        McpServerController off =
                new McpServerController(
                        mapper,
                        props,
                        List.of(
                                new StirlingUploadTool(mapper, null, null, null),
                                new StirlingSelectFileTool(mapper, null, null)),
                        new McpWidget(mapper, props));

        JsonNode tools =
                mapper.valueToTree(
                                off.handle(
                                                mapper.readTree(
                                                        "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}"),
                                                new HttpHeaders())
                                        .getBody())
                        .get("result")
                        .get("tools");
        assertEquals(1, tools.size(), "picker is hidden without the widget");
        assertEquals("stirling_upload", tools.get(0).get("name").asText());
        assertNull(tools.get(0).get("_meta"));

        JsonNode init =
                mapper.valueToTree(
                        off.handle(
                                        mapper.readTree(
                                                "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\"}"),
                                        new HttpHeaders())
                                .getBody());
        assertNull(init.get("result").get("capabilities").get("extensions"));

        JsonNode resources =
                mapper.valueToTree(
                        off.handle(
                                        mapper.readTree(
                                                "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"resources/list\"}"),
                                        new HttpHeaders())
                                .getBody());
        assertEquals(0, resources.get("result").get("resources").size());
    }

    @Test
    void widget_trustsOwnOriginsAsChatGptRedirectTargets() {
        ApplicationProperties props = new ApplicationProperties();
        props.getSystem().setFrontendUrl("https://pdf.example.com/app");
        props.getSystem().setBackendUrl("https://api.example.com:8443");

        JsonNode csp =
                new McpWidget(mapper, props)
                        .contents(McpWidget.URI)
                        .get("_meta")
                        .get("openai/widgetCSP");

        assertEquals(
                List.of("https://pdf.example.com", "https://api.example.com:8443"),
                mapper.convertValue(csp.get("redirect_domains"), List.class));
        assertEquals(0, csp.get("connect_domains").size());
    }

    @Test
    void pickerIsAThreadEntrypointWithAMonochromeIcon() throws Exception {
        ApplicationProperties props = new ApplicationProperties();
        McpServerController withPicker =
                new McpServerController(
                        mapper,
                        props,
                        List.of(new StirlingSelectFileTool(mapper, null, null)),
                        new McpWidget(mapper, props));

        JsonNode picker =
                mapper.valueToTree(
                                withPicker
                                        .handle(
                                                mapper.readTree(
                                                        "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}"),
                                                new HttpHeaders())
                                        .getBody())
                        .get("result")
                        .get("tools")
                        .get(0);
        assertEquals(
                "thread",
                picker.get("_meta")
                        .get("openai/ui")
                        .get("entrypoints")
                        .get(0)
                        .get("type")
                        .asText());
        assertEquals(
                McpWidget.PICKER_URI, picker.get("_meta").get("ui").get("resourceUri").asText());
        String src = picker.get("icons").get(0).get("src").asText();
        assertTrue(src.startsWith("data:image/svg+xml;base64,"));
        String svg =
                new String(
                        Base64.getDecoder().decode(src.substring(src.indexOf(',') + 1)),
                        StandardCharsets.UTF_8);
        assertTrue(svg.contains("currentColor") && svg.contains("0 0 20 20"));

        JsonNode info =
                mapper.valueToTree(
                                withPicker
                                        .handle(
                                                mapper.readTree(
                                                        "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\"}"),
                                                new HttpHeaders())
                                        .getBody())
                        .get("result")
                        .get("serverInfo");
        assertEquals("image/svg+xml", info.get("icons").get(0).get("mimeType").asText());
    }

    @Test
    void resultsStayInlineAndOnlyThePickerMayGoFullscreen() {
        ApplicationProperties props = new ApplicationProperties();
        McpWidget widget = new McpWidget(mapper, props);

        JsonNode results = widget.contents(McpWidget.URI).get("_meta").get("openai/ui");
        JsonNode picker = widget.contents(McpWidget.PICKER_URI).get("_meta").get("openai/ui");

        assertEquals("inline", results.get("preferredDisplayMode").asText());
        assertEquals("[\"inline\"]", results.get("availableDisplayModes").toString());
        assertEquals("[\"inline\",\"fullscreen\"]", picker.get("availableDisplayModes").toString());
        assertEquals(2, widget.listings().size());
    }

    @Test
    void libraryIsAGlobalEntrypointAndMentionSearchIsAppOnly() throws Exception {
        ApplicationProperties props = new ApplicationProperties();
        McpServerController withFiles =
                new McpServerController(
                        mapper,
                        props,
                        List.of(
                                new StirlingFilesTool(mapper, null),
                                new StirlingMentionFilesTool(mapper, null)),
                        new McpWidget(mapper, props));
        JsonNode body = mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}");

        JsonNode tools =
                mapper.valueToTree(withFiles.handle(body, new HttpHeaders()).getBody())
                        .get("result")
                        .get("tools");

        JsonNode library = tools.get(0);
        assertEquals("stirling_files", library.get("name").asText());
        assertEquals("global", library.at("/_meta/openai~1ui/entrypoints/0/type").asText());
        assertEquals(McpWidget.PICKER_URI, library.at("/_meta/ui/resourceUri").asText());
        assertTrue(library.has("icons"));
        JsonNode mentions = tools.get(1);
        assertEquals("stirling_mention_files", mentions.get("name").asText());
        assertTrue(mentions.at("/_meta/openai~1extensions/mentions~1search").isObject());
        assertEquals("[\"app\"]", mentions.at("/_meta/ui/visibility").toString());
    }

    @Test
    void toolsList_onlyToolsTheWidgetCallsAreWidgetAccessible() throws Exception {
        ApplicationProperties props = new ApplicationProperties();
        McpServerController withUpload =
                new McpServerController(
                        mapper,
                        props,
                        List.of(
                                new StirlingUploadTool(mapper, null, null, null),
                                new StirlingSelectFileTool(mapper, null, null)),
                        new McpWidget(mapper, props));
        JsonNode body = mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}");

        JsonNode tools =
                mapper.valueToTree(withUpload.handle(body, new HttpHeaders()).getBody())
                        .get("result")
                        .get("tools");

        for (JsonNode t : tools) {
            boolean accessible = t.path("_meta").path("openai/widgetAccessible").asBoolean(false);
            assertEquals(
                    accessible,
                    t.path("_meta").path("ui").path("visibility").toString().contains("app"),
                    "ui.visibility mirrors widgetAccessible for " + t.get("name").asText());
            assertEquals(
                    "stirling_upload".equals(t.get("name").asText()),
                    accessible,
                    t.get("name").asText());
        }
    }

    @Test
    void toolsList_onlyToolsThatReachOutsideServicesAreOpenWorld() throws Exception {
        JsonNode body = mapper.readTree("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}");

        JsonNode tools =
                mapper.valueToTree(controller.handle(body, new HttpHeaders()).getBody())
                        .get("result")
                        .get("tools");

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
    void structuredResultsCarryTheTextForHostsThatOnlyShowData() {
        ObjectNode result = mapper.createObjectNode();
        result.putArray("content")
                .addObject()
                .put("type", "text")
                .put("text", "A file picker is shown to the user.");
        result.putObject("structuredContent").put("kind", "picker");
        ObjectNode plain = mapper.createObjectNode();
        plain.putArray("content").addObject().put("type", "text").put("text", "done");

        McpServerController.withMessage(result);
        McpServerController.withMessage(plain);

        assertEquals(
                "A file picker is shown to the user.",
                result.get("structuredContent").get("message").asText());
        assertFalse(plain.has("structuredContent"));
    }
}
