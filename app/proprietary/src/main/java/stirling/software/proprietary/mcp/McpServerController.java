package stirling.software.proprietary.mcp;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.mcp.jsonrpc.JsonRpcError;
import stirling.software.proprietary.mcp.jsonrpc.JsonRpcRequest;
import stirling.software.proprietary.mcp.jsonrpc.JsonRpcResponse;
import stirling.software.proprietary.mcp.tools.McpResponses;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

/** Streamable-HTTP MCP server endpoint serving JSON-RPC 2.0 frames on {@code POST /mcp}. */
@Slf4j
@RestController
@RequestMapping
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class McpServerController {

    private static final String PREFERRED_PROTOCOL_VERSION = "2025-06-18";
    private static final Set<String> SUPPORTED_PROTOCOL_VERSIONS =
            Set.of("2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05");
    private static final String SERVER_NAME = "stirling-pdf-mcp";
    private static final Set<String> MODERN_METHODS =
            Set.of(
                    "server/discover",
                    "tools/list",
                    "tools/call",
                    "resources/list",
                    "resources/templates/list",
                    "resources/read",
                    "prompts/list");
    private static final Set<String> CACHEABLE_METHODS =
            Set.of(
                    "server/discover",
                    "tools/list",
                    "resources/list",
                    "resources/templates/list",
                    "resources/read",
                    "prompts/list");
    // Matches the AI tool catalog refresh; lists sit behind auth, so private.
    private static final long CACHE_TTL_MS = 5 * 60 * 1000L;

    private final ObjectMapper mapper;
    private final ApplicationProperties applicationProperties;
    private final Map<String, McpTool> toolsByName;
    private final McpWidget widget;
    private final McpCallObserver observer;
    private final McpAnalytics analytics;

    public McpServerController(
            ObjectMapper mapper,
            ApplicationProperties applicationProperties,
            List<McpTool> tools,
            McpWidget widget,
            McpAnalytics analytics) {
        this(mapper, applicationProperties, tools, widget, (McpCallObserver) null, analytics);
    }

    @Autowired
    public McpServerController(
            ObjectMapper mapper,
            ApplicationProperties applicationProperties,
            List<McpTool> tools,
            McpWidget widget,
            ObjectProvider<McpCallObserver> observer,
            McpAnalytics analytics) {
        this(mapper, applicationProperties, tools, widget, observer.getIfAvailable(), analytics);
    }

    McpServerController(
            ObjectMapper mapper,
            ApplicationProperties applicationProperties,
            List<McpTool> tools,
            McpWidget widget,
            McpCallObserver observer,
            McpAnalytics analytics) {
        this.observer = observer;
        this.analytics = analytics;
        this.mapper = mapper;
        this.applicationProperties = applicationProperties;
        this.widget = widget;
        // Sorted so tools/list is deterministic, which clients and prompt caches rely on.
        this.toolsByName = new TreeMap<>();
        boolean widgetOn = applicationProperties.getMcp().isWidgetEnabled();
        for (McpTool tool : tools) {
            if (widgetOn || !tool.requiresWidget()) {
                this.toolsByName.put(tool.name(), tool);
            }
        }
        log.info(
                "MCP server controller wired with {} tool(s): {}",
                toolsByName.size(),
                toolsByName.keySet());
    }

    @PostMapping(
            path = "/mcp",
            consumes = MediaType.APPLICATION_JSON_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<?> handle(
            @RequestBody JsonNode body, @RequestHeader HttpHeaders headers) {
        JsonRpcRequest request = decode(body);
        if (request == null) {
            // Valid JSON but not a JSON-RPC request -> Invalid Request, not Parse error.
            return ResponseEntity.badRequest()
                    .body(
                            JsonRpcResponse.failure(
                                    null,
                                    JsonRpcError.invalidRequest(
                                            "Body is not a valid JSON-RPC 2.0 request")));
        }
        if (request.isNotification()) {
            log.debug("Notification received: {}", sanitizeForLog(request.method()));
            return ResponseEntity.status(HttpStatus.ACCEPTED).build();
        }
        boolean modern =
                McpModernProtocol.isModern(
                        request, headers.getFirst(McpModernProtocol.VERSION_HEADER));
        if (modern) {
            JsonRpcError invalid = McpModernProtocol.validate(request, headers, mapper);
            if (invalid != null) {
                return ResponseEntity.badRequest()
                        .body(JsonRpcResponse.failure(request.id(), invalid));
            }
            if (!MODERN_METHODS.contains(request.method())) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(
                                JsonRpcResponse.failure(
                                        request.id(),
                                        JsonRpcError.methodNotFound(request.method())));
            }
        }
        String sessionId = "initialize".equals(request.method()) ? analytics.startSession() : null;
        JsonRpcResponse response;
        try {
            response = dispatch(request, modern);
        } catch (RuntimeException e) {
            log.warn(
                    "MCP dispatch failed for method {}: {}",
                    sanitizeForLog(request.method()),
                    e.getMessage(),
                    e);
            response =
                    JsonRpcResponse.failure(
                            request.id(),
                            JsonRpcError.internalError(
                                    "Internal error handling " + request.method()));
        }
        JsonRpcResponse out = modern ? decorate(response, request.method()) : response;
        if (sessionId != null) {
            return ResponseEntity.ok().header(McpAnalytics.SESSION_HEADER, sessionId).body(out);
        }
        return ResponseEntity.ok(out);
    }

    /** Modern results: resultType, our identity, and cache hints on list/read results. */
    private JsonRpcResponse decorate(JsonRpcResponse response, String method) {
        if (!(response.result() instanceof ObjectNode result)) {
            return response;
        }
        if (!result.has("resultType")) {
            result.put("resultType", "complete");
        }
        ObjectNode meta =
                result.get("_meta") instanceof ObjectNode existing
                        ? existing
                        : result.putObject("_meta");
        meta.set(McpModernProtocol.SERVER_INFO_KEY, serverInfo());
        if (CACHEABLE_METHODS.contains(method)) {
            result.put("ttlMs", CACHE_TTL_MS);
            result.put("cacheScope", "private");
        }
        return response;
    }

    /** Wrap malformed-JSON failures (caught before {@link #handle}) as a JSON-RPC Parse error. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<JsonRpcResponse> handleUnreadable(HttpMessageNotReadableException ex) {
        return ResponseEntity.badRequest()
                .contentType(MediaType.APPLICATION_JSON)
                .body(
                        JsonRpcResponse.failure(
                                null, JsonRpcError.parseError("Request body is not valid JSON")));
    }

    private static String sanitizeForLog(String value) {
        return value == null ? null : value.replace('\r', ' ').replace('\n', ' ');
    }

    private JsonRpcRequest decode(JsonNode body) {
        if (body == null || !body.isObject()) {
            return null;
        }
        JsonNode jsonrpc = body.get("jsonrpc");
        JsonNode method = body.get("method");
        if (jsonrpc == null || !"2.0".equals(jsonrpc.asText())) {
            return null;
        }
        if (method == null || !method.isTextual()) {
            return null;
        }
        return new JsonRpcRequest(
                jsonrpc.asText(), body.get("id"), method.asText(), body.get("params"));
    }

    private JsonRpcResponse dispatch(JsonRpcRequest request, boolean modern) {
        return switch (request.method()) {
            case "server/discover" ->
                    JsonRpcResponse.success(request.id(), discoverResult(request.params()));
            case "initialize" ->
                    JsonRpcResponse.success(request.id(), initializeResult(request.params()));
            case "tools/list" -> JsonRpcResponse.success(request.id(), toolsListResult());
            case "tools/call" -> handleToolsCall(request, modern);
            case "resources/list" -> JsonRpcResponse.success(request.id(), resourcesListResult());
            case "resources/templates/list" ->
                    JsonRpcResponse.success(request.id(), emptyList("resourceTemplates"));
            case "resources/read" -> handleResourcesRead(request, modern);
            case "prompts/list" -> JsonRpcResponse.success(request.id(), emptyList("prompts"));
            case "ping" -> JsonRpcResponse.success(request.id(), mapper.createObjectNode());
            case "notifications/initialized" ->
                    JsonRpcResponse.success(request.id(), mapper.createObjectNode());
            default ->
                    JsonRpcResponse.failure(
                            request.id(), JsonRpcError.methodNotFound(request.method()));
        };
    }

    private ObjectNode initializeResult(JsonNode params) {
        ObjectNode result = mapper.createObjectNode();
        // Echo the client's requested protocolVersion when supported, else advertise our preferred.
        String requested =
                params != null && params.hasNonNull("protocolVersion")
                        ? params.get("protocolVersion").asText()
                        : null;
        String negotiated =
                requested != null && SUPPORTED_PROTOCOL_VERSIONS.contains(requested)
                        ? requested
                        : PREFERRED_PROTOCOL_VERSION;
        result.put("protocolVersion", negotiated);
        analytics.initialize(params, negotiated);
        result.set("capabilities", capabilities());
        result.set("serverInfo", serverInfo());
        result.put(
                "instructions",
                instructions(params == null ? null : params.get("capabilities"), false));
        return result;
    }

    private ObjectNode discoverResult(JsonNode params) {
        ObjectNode result = mapper.createObjectNode();
        McpModernProtocol.supportedVersions().forEach(result.putArray("supportedVersions")::add);
        result.set("capabilities", capabilities());
        JsonNode meta = params == null ? null : params.get("_meta");
        result.put(
                "instructions",
                instructions(
                        meta == null ? null : meta.get(McpModernProtocol.CAPABILITIES_KEY), true));
        return result;
    }

    /** Workflow hints for the model's system prompt; tool descriptions cover the details. */
    String instructions() {
        return instructions(null, true);
    }

    /** Hints match the client: only 2026-07-28 clients can answer a form, few render the card. */
    String instructions(JsonNode clientCapabilities, boolean modern) {
        McpCallContext client = new McpCallContext(null, Set.of(), false, clientCapabilities, null);
        boolean known = clientCapabilities != null && clientCapabilities.isObject();
        List<String> hints = new ArrayList<>();
        hints.add("Stirling PDF processes the user's documents in their Stirling PDF account.");
        hints.add(
                "- Use Stirling's tools for the PDF work they cover, so results land in the user's"
                        + " Stirling PDF files.");
        hints.add(
                "- Each category tool takes an 'operation' and its 'parameters', listed briefly with"
                        + " each operation. Call stirling_describe_operation for what an option"
                        + " means, after any parameter error, and before telling the user Stirling"
                        + " cannot do something.");
        hints.add(
                "- Input: a chat attachment, a 'fileId' from an earlier result, or 'fileIds' for"
                        + " operations that take several files. A second file an operation needs"
                        + " (a certificate, logo or stamp image, overlay PDF, attachment) goes in"
                        + " that operation's fileId parameter: store it first with stirling_upload"
                        + (available("stirling_select_file") ? " or stirling_select_file" : "")
                        + ".");
        hints.add(
                "- For a file on the user's computer that is not attached (or is bigger than about"
                        + " 100 KB), never send it as base64: call stirling_upload with link: true"
                        + " and give the user the link, or upload to it with curl if you can run"
                        + " commands on their computer.");
        hints.add(
                "- Chain steps by passing each result's fileId to the next call. Do not download"
                        + " or re-upload in between.");
        hints.add(
                "- If a result is pending with a jobId, call stirling_job_status about every 30"
                        + " seconds until it finishes.");
        // Without a form (older protocol or plain clients) the user must give the password in chat.
        if (modern && known && client.canElicitForm()) {
            hints.add(
                    "- Never ask the user to paste a PDF password into the chat; Stirling asks for"
                            + " it itself in a form.");
        } else if (known || !modern) {
            hints.add(
                    "- If an operation needs a PDF password, ask the user for it and pass it in"
                            + " 'parameters'.");
        } else {
            hints.add(
                    "- Stirling asks for PDF passwords itself in a form when the app supports one;"
                            + " only if no form appears, ask the user and pass it in 'parameters'.");
        }
        if (available("stirling_run_pipeline")) {
            hints.add(
                    "- For several operations on one file (or each piece of a split), send them"
                            + " all in one stirling_run_pipeline call.");
            hints.add(
                    "- Automations matter: whenever the user wants PDF work done repeatedly,"
                            + " automatically, in bulk, on a schedule or for every incoming or"
                            + " uploaded file (\"always\", \"every invoice\", \"each week\","
                            + " \"set up\", \"automate\", \"workflow\"), build it as a"
                            + " Stirling PDF automation yourself rather than describing manual"
                            + " steps. Call stirling_list_automations to reuse a match and to see"
                            + " the team's connections. Try the steps once with"
                            + " stirling_run_pipeline so the user sees the result, tell them the"
                            + " plan (where files come from, whether they are removed there,"
                            + " when it runs, where results go), then save it with"
                            + " stirling_save_automation so it runs on its own.");
            hints.add(
                    "- stirling_run_pipeline only tests: results come back here and nothing"
                            + " reaches a destination. stirling_run_automation runs a saved"
                            + " automation for real, so only use it once the user agrees."
                            + " stirling_automation_runs says how runs went.");
        }
        if (available("stirling_files")) {
            hints.add(
                    "- When the user refers to a file they already have in Stirling, find its"
                            + " fileId with stirling_files.");
        }
        if (available("stirling_select_file")) {
            hints.add(
                    "- When a file is needed and none is attached, call stirling_select_file"
                            + " rather than asking for the file in text.");
        }
        // Only clients that render MCP Apps show the card; others need the link in the reply.
        if (widgetEnabled() && client.rendersApps()) {
            hints.add(
                    "- Results appear as a card with Open and Download buttons, so keep replies"
                            + " short and do not repeat links or file details.");
        } else if (widgetEnabled()) {
            hints.add(
                    "- If the result shows as a card with Open and Download buttons, keep replies"
                            + " short and do not repeat links; otherwise give the user the result's"
                            + " download link.");
        } else {
            hints.add("- Give the user each result's download link when it has one.");
        }
        return String.join("\n", hints);
    }

    /** Listed and switched on, so hints never point at a tool the client can't see. */
    private boolean available(String name) {
        McpTool tool = toolsByName.get(name);
        return tool != null && tool.available();
    }

    private ObjectNode capabilities() {
        ObjectNode caps = mapper.createObjectNode();
        caps.putObject("tools");
        caps.putObject("resources");
        if (widgetEnabled()) {
            // MCP Apps extension: tools render the ui:// widget in hosts that support it.
            caps.putObject("extensions")
                    .putObject("io.modelcontextprotocol/ui")
                    .putArray("mimeTypes")
                    .add(McpWidget.MIME_TYPE);
        }
        return caps;
    }

    private ObjectNode serverInfo() {
        ObjectNode info = mapper.createObjectNode();
        info.put("name", SERVER_NAME);
        info.put("title", "Stirling PDF");
        info.put("version", applicationProperties.getAutomaticallyGenerated().getAppVersion());
        info.set("icons", widget.serverIcons());
        return info;
    }

    private ObjectNode toolsListResult() {
        ObjectNode result = mapper.createObjectNode();
        ArrayNode tools = result.putArray("tools");
        for (McpTool t : toolsByName.values()) {
            if (!t.available()) {
                continue;
            }
            ObjectNode entry = mapper.createObjectNode();
            entry.put("name", t.name());
            entry.put("title", t.title());
            entry.put("description", t.description());
            entry.set("inputSchema", t.inputSchema());
            entry.set("annotations", t.annotations().toJson(mapper, t.title()));
            if (isEntrypoint(t) && widgetEnabled()) {
                entry.set("icons", widget.entrypointIcons());
            }
            ObjectNode meta = toolMeta(t);
            if (!meta.isEmpty()) {
                entry.set("_meta", meta);
            }
            tools.add(entry);
        }
        analytics.toolsList(List.copyOf(toolsByName.keySet()));
        return result;
    }

    /** MCP Apps link plus the ChatGPT aliases and file-param hints. */
    private ObjectNode toolMeta(McpTool t) {
        ObjectNode meta = mapper.createObjectNode();
        if (t.rendersWidget() && widgetEnabled()) {
            String template = isEntrypoint(t) ? McpWidget.PICKER_URI : McpWidget.URI;
            meta.putObject("ui").put("resourceUri", template);
            meta.put("openai/outputTemplate", template);
            meta.put("openai/toolInvocation/invoking", "Working on your file...");
            meta.put("openai/toolInvocation/invoked", "Done");
        }
        if (isEntrypoint(t) && widgetEnabled()) {
            ArrayNode entrypoints = meta.putObject("openai/ui").putArray("entrypoints");
            if (t.threadEntrypoint()) {
                entrypoints.addObject().put("type", "thread");
            }
            if (t.globalEntrypoint()) {
                entrypoints.addObject().put("type", "global");
            }
        }
        if (t.mentionSearch()) {
            meta.putObject("openai/extensions").putObject("mentions/search");
            ObjectNode ui = meta.has("ui") ? (ObjectNode) meta.get("ui") : meta.putObject("ui");
            ui.putArray("visibility").add("app");
        }
        if (t.widgetCallable() && widgetEnabled()) {
            ObjectNode ui = meta.has("ui") ? (ObjectNode) meta.get("ui") : meta.putObject("ui");
            ui.putArray("visibility").add("model").add("app");
            meta.put("openai/widgetAccessible", true);
        }
        if (!t.fileParams().isEmpty() && attachmentsEnabled()) {
            ArrayNode params = meta.putArray("openai/fileParams");
            t.fileParams().forEach(params::add);
        }
        return meta;
    }

    private static List<String> capabilityNames(ObjectNode capabilities) {
        List<String> names = new ArrayList<>();
        capabilities
                .properties()
                .forEach(
                        e -> {
                            names.add(e.getKey());
                            if (e.getValue() instanceof ObjectNode nested) {
                                nested.propertyNames()
                                        .forEach(n -> names.add(e.getKey() + "." + n));
                            }
                        });
        return names;
    }

    private static boolean isEntrypoint(McpTool t) {
        return t.threadEntrypoint() || t.globalEntrypoint();
    }

    private ObjectNode emptyList(String field) {
        ObjectNode result = mapper.createObjectNode();
        result.putArray(field);
        return result;
    }

    private boolean widgetEnabled() {
        return applicationProperties.getMcp().isWidgetEnabled();
    }

    // Without allowed hosts every attachment fails, so don't invite chat apps to send them.
    private boolean attachmentsEnabled() {
        return applicationProperties.getMcp().getFileUrlAllowedHosts().stream()
                .anyMatch(h -> h != null && !h.isBlank());
    }

    private ObjectNode resourcesListResult() {
        ObjectNode result = mapper.createObjectNode();
        ArrayNode resources = result.putArray("resources");
        if (widgetEnabled()) {
            widget.listings().forEach(resources::add);
        }
        return result;
    }

    private JsonRpcResponse handleResourcesRead(JsonRpcRequest request, boolean modern) {
        JsonNode params = request.params();
        String uri = params != null && params.hasNonNull("uri") ? params.get("uri").asText() : null;
        if (!widgetEnabled() || !widget.serves(uri)) {
            // 2026-07-28 moved "resource not found" from -32002 to Invalid Params.
            int code = modern ? JsonRpcError.INVALID_PARAMS : -32002;
            return JsonRpcResponse.failure(
                    request.id(), new JsonRpcError(code, "Resource not found: " + uri, null));
        }
        ObjectNode result = mapper.createObjectNode();
        result.putArray("contents").add(widget.contents(uri));
        return JsonRpcResponse.success(request.id(), result);
    }

    private JsonRpcResponse handleToolsCall(JsonRpcRequest request, boolean modern) {
        JsonNode params = request.params();
        if (params == null || !params.isObject()) {
            return JsonRpcResponse.failure(
                    request.id(), JsonRpcError.invalidParams("Missing params for tools/call"));
        }
        JsonNode nameNode = params.get("name");
        if (nameNode == null || !nameNode.isTextual()) {
            return JsonRpcResponse.failure(
                    request.id(), JsonRpcError.invalidParams("Missing tool name"));
        }
        McpTool tool = toolsByName.get(nameNode.asText());
        if (tool == null) {
            return JsonRpcResponse.failure(
                    request.id(), JsonRpcError.invalidParams("Unknown tool: " + nameNode.asText()));
        }
        JsonNode args = params.get("arguments");
        McpCallContext context = resolveContext(params, modern);
        String user = context.stirlingUserId();
        long wait = observer == null ? 0 : observer.secondsUntilAllowed(user);
        if (wait > 0) {
            ObjectNode limited =
                    McpResponses.error(
                            mapper,
                            "Rate limit reached for Stirling PDF. Wait "
                                    + wait
                                    + " seconds, then retry the same call.",
                            McpResponses.Failure.RATE_LIMITED);
            McpResponses.errorDetail(limited).put("retryAfterSeconds", wait);
            return JsonRpcResponse.success(request.id(), limited);
        }
        long started = System.nanoTime();
        ObjectNode toolResult = null;
        RuntimeException failure = null;
        try {
            toolResult = tool.call(args == null ? mapper.createObjectNode() : args, context);
            withMessage(toolResult);
            return JsonRpcResponse.success(request.id(), toolResult);
        } catch (RuntimeException e) {
            failure = e;
            throw e;
        } finally {
            long elapsed = System.nanoTime() - started;
            if (observer != null) {
                observer.record(user, tool.name(), args, toolResult, elapsed);
            }
            analytics.toolCall(tool, args, elapsed / 1_000_000, toolResult, failure);
        }
    }

    /**
     * Copies the result's text into its structured data: some hosts (Claude Code) show the model
     * only the structured data, which would drop the guidance the text carries.
     */
    static void withMessage(ObjectNode result) {
        if (result == null || !(result.get("structuredContent") instanceof ObjectNode card)) {
            return;
        }
        String text = result.path("content").path(0).path("text").asText("").strip();
        if (!text.isEmpty() && !card.has("message")) {
            card.put("message", text);
        }
    }

    private McpCallContext resolveContext(JsonNode params, boolean modern) {
        boolean scopesEnabled = applicationProperties.getMcp().isScopesEnabled();
        // Only modern clients can answer an input_required result, so only they get MRTR.
        JsonNode meta = modern ? params.get("_meta") : null;
        JsonNode capabilities = meta == null ? null : meta.get(McpModernProtocol.CAPABILITIES_KEY);
        if (!widgetEnabled() && capabilities instanceof ObjectNode caps && caps.has("extensions")) {
            // No widget to show, so results must keep their links in the text.
            ObjectNode copy = caps.deepCopy();
            ((ObjectNode) copy.get("extensions")).remove("io.modelcontextprotocol/ui");
            capabilities = copy;
        }
        if (log.isDebugEnabled() && capabilities instanceof ObjectNode declared) {
            // Names only: shows which client features (forms, apps, extensions) a host offers.
            log.debug("MCP client capabilities: {}", capabilityNames(declared));
        }
        JsonNode inputResponses = modern ? params.get("inputResponses") : null;
        org.springframework.security.core.Authentication auth =
                org.springframework.security.core.context.SecurityContextHolder.getContext()
                        .getAuthentication();
        // Fail closed: no/unauthenticated principal yields an empty context so scoped ops are
        // refused.
        if (auth == null || !auth.isAuthenticated() || auth.getName() == null) {
            return new McpCallContext(null, Set.of(), scopesEnabled, capabilities, inputResponses);
        }
        java.util.Set<String> scopes = new java.util.HashSet<>();
        for (org.springframework.security.core.GrantedAuthority ga : auth.getAuthorities()) {
            String authority = ga.getAuthority();
            if (authority != null && authority.startsWith("SCOPE_")) {
                scopes.add(authority.substring("SCOPE_".length()));
            }
        }
        return new McpCallContext(
                auth.getName(), scopes, scopesEnabled, capabilities, inputResponses);
    }
}
