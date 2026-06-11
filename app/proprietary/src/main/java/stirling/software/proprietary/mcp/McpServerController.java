package stirling.software.proprietary.mcp;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;
import stirling.software.proprietary.mcp.jsonrpc.JsonRpcError;
import stirling.software.proprietary.mcp.jsonrpc.JsonRpcRequest;
import stirling.software.proprietary.mcp.jsonrpc.JsonRpcResponse;

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
            Set.of("2025-06-18", "2025-03-26", "2024-11-05");
    private static final String SERVER_NAME = "stirling-pdf-mcp";

    private final ObjectMapper mapper;
    private final ApplicationProperties applicationProperties;
    private final Map<String, McpTool> toolsByName;

    public McpServerController(
            ObjectMapper mapper, ApplicationProperties applicationProperties, List<McpTool> tools) {
        this.mapper = mapper;
        this.applicationProperties = applicationProperties;
        this.toolsByName = new HashMap<>();
        for (McpTool tool : tools) {
            this.toolsByName.put(tool.name(), tool);
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
    public ResponseEntity<?> handle(@RequestBody JsonNode body) {
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
            return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
        }
        JsonRpcResponse response;
        try {
            response = dispatch(request);
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
        return ResponseEntity.ok(response);
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

    private JsonRpcResponse dispatch(JsonRpcRequest request) {
        return switch (request.method()) {
            case "initialize" ->
                    JsonRpcResponse.success(request.id(), initializeResult(request.params()));
            case "tools/list" -> JsonRpcResponse.success(request.id(), toolsListResult());
            case "tools/call" -> handleToolsCall(request);
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
        ObjectNode caps = result.putObject("capabilities");
        caps.putObject("tools");
        ObjectNode info = result.putObject("serverInfo");
        info.put("name", SERVER_NAME);
        info.put("version", applicationProperties.getAutomaticallyGenerated().getAppVersion());
        return result;
    }

    private ObjectNode toolsListResult() {
        ObjectNode result = mapper.createObjectNode();
        ArrayNode tools = result.putArray("tools");
        for (McpTool t : toolsByName.values()) {
            ObjectNode entry = mapper.createObjectNode();
            entry.put("name", t.name());
            entry.put("description", t.description());
            entry.set("inputSchema", t.inputSchema());
            tools.add(entry);
        }
        return result;
    }

    private JsonRpcResponse handleToolsCall(JsonRpcRequest request) {
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
        McpCallContext context = resolveContext();
        ObjectNode toolResult = tool.call(args == null ? mapper.createObjectNode() : args, context);
        return JsonRpcResponse.success(request.id(), toolResult);
    }

    private McpCallContext resolveContext() {
        boolean scopesEnabled = applicationProperties.getMcp().isScopesEnabled();
        org.springframework.security.core.Authentication auth =
                org.springframework.security.core.context.SecurityContextHolder.getContext()
                        .getAuthentication();
        // Fail closed: no/unauthenticated principal yields an empty context so scoped ops are
        // refused.
        if (auth == null || !auth.isAuthenticated() || auth.getName() == null) {
            return new McpCallContext(null, Set.of(), scopesEnabled);
        }
        java.util.Set<String> scopes = new java.util.HashSet<>();
        for (org.springframework.security.core.GrantedAuthority ga : auth.getAuthorities()) {
            String authority = ga.getAuthority();
            if (authority != null && authority.startsWith("SCOPE_")) {
                scopes.add(authority.substring("SCOPE_".length()));
            }
        }
        return new McpCallContext(auth.getName(), scopes, scopesEnabled);
    }
}
