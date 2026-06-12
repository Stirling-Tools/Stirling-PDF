package stirling.software.proprietary.mcp;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import io.quarkus.arc.lookup.LookupIfProperty;
import io.quarkus.security.identity.SecurityIdentity;

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
@ApplicationScoped
@jakarta.ws.rs.Path("/mcp")
// @ConditionalOnProperty(name = "mcp.enabled", havingValue = "true") -> LookupIfProperty.
// LookupIfProperty gates programmatic lookup; for a JAX-RS resource Quarkus always registers the
// endpoint. TODO: Migration required - to truly disable the /mcp route when mcp.enabled=false,
// add a runtime guard (e.g. reject in handle() when disabled) or use a build-time conditional;
// LookupIfProperty alone does not unregister the REST path.
@LookupIfProperty(name = "mcp.enabled", stringValue = "true")
public class McpServerController {

    private static final String PREFERRED_PROTOCOL_VERSION = "2025-06-18";
    private static final Set<String> SUPPORTED_PROTOCOL_VERSIONS =
            Set.of("2025-06-18", "2025-03-26", "2024-11-05");
    private static final String SERVER_NAME = "stirling-pdf-mcp";

    private final ObjectMapper mapper;
    private final ApplicationProperties applicationProperties;
    private final Map<String, McpTool> toolsByName;

    @Inject SecurityIdentity securityIdentity;

    @Inject
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

    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @jakarta.ws.rs.Produces(MediaType.APPLICATION_JSON)
    public Response handle(JsonNode body) {
        JsonRpcRequest request = decode(body);
        if (request == null) {
            // Valid JSON but not a JSON-RPC request -> Invalid Request, not Parse error.
            return Response.status(Response.Status.BAD_REQUEST)
                    .entity(
                            JsonRpcResponse.failure(
                                    null,
                                    JsonRpcError.invalidRequest(
                                            "Body is not a valid JSON-RPC 2.0 request")))
                    .build();
        }
        if (request.isNotification()) {
            log.debug("Notification received: {}", sanitizeForLog(request.method()));
            return Response.status(Response.Status.NO_CONTENT).build();
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
        return Response.ok(response).build();
    }

    // Spring's @ExceptionHandler(HttpMessageNotReadableException.class) wrapped malformed-JSON
    // failures as a JSON-RPC Parse error. In JAX-RS this maps to a
    // jakarta.ws.rs.ext.ExceptionMapper provider. TODO: Migration required - move this handling to
    // a @Provider ExceptionMapper<...> (e.g. mapping the JSON deserialization exception thrown by
    // the Jackson MessageBodyReader) returning HTTP 400 with
    // JsonRpcResponse.failure(null, JsonRpcError.parseError("Request body is not valid JSON")).
    // Kept here for reference; it is no longer wired as an exception handler.
    private Response handleUnreadable() {
        return Response.status(Response.Status.BAD_REQUEST)
                .type(MediaType.APPLICATION_JSON)
                .entity(
                        JsonRpcResponse.failure(
                                null, JsonRpcError.parseError("Request body is not valid JSON")))
                .build();
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
        // Spring SecurityContextHolder.getContext().getAuthentication() -> Quarkus SecurityIdentity.
        // Fail closed: an anonymous/unauthenticated identity yields an empty context so scoped ops
        // are refused.
        if (securityIdentity == null
                || securityIdentity.isAnonymous()
                || securityIdentity.getPrincipal() == null
                || securityIdentity.getPrincipal().getName() == null) {
            return new McpCallContext(null, Set.of(), scopesEnabled);
        }
        java.util.Set<String> scopes = new java.util.HashSet<>();
        // TODO: Migration required - the Spring code derived scopes from GrantedAuthority values
        // prefixed with "SCOPE_". Quarkus SecurityIdentity.getRoles() typically already carries the
        // bare role/scope names (quarkus-oidc maps OIDC scopes to roles without the SCOPE_ prefix).
        // Confirm the configured quarkus.oidc role/scope mapping; if scopes arrive as a "scope"
        // claim, read them via securityIdentity.getAttribute("scope")/getClaims() instead. For now
        // we accept both the bare role and any "SCOPE_"-prefixed authority for parity.
        for (String role : securityIdentity.getRoles()) {
            if (role == null) {
                continue;
            }
            if (role.startsWith("SCOPE_")) {
                scopes.add(role.substring("SCOPE_".length()));
            } else {
                scopes.add(role);
            }
        }
        return new McpCallContext(securityIdentity.getPrincipal().getName(), scopes, scopesEnabled);
    }
}
