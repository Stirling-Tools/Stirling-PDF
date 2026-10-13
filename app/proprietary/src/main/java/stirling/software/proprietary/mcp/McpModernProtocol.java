package stirling.software.proprietary.mcp;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Set;

import org.springframework.http.HttpHeaders;

import stirling.software.proprietary.mcp.jsonrpc.JsonRpcError;
import stirling.software.proprietary.mcp.jsonrpc.JsonRpcRequest;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.MissingNode;
import tools.jackson.databind.node.ObjectNode;

/** Per-request rules of MCP 2026-07-28; older clients still use the initialize handshake. */
final class McpModernProtocol {

    static final String VERSION = "2026-07-28";
    static final List<String> LEGACY_VERSIONS =
            List.of("2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05");
    static final String VERSION_KEY = "io.modelcontextprotocol/protocolVersion";
    static final String CAPABILITIES_KEY = "io.modelcontextprotocol/clientCapabilities";
    static final String SERVER_INFO_KEY = "io.modelcontextprotocol/serverInfo";

    static final String VERSION_HEADER = "MCP-Protocol-Version";
    static final String METHOD_HEADER = "Mcp-Method";
    static final String NAME_HEADER = "Mcp-Name";

    static final int HEADER_MISMATCH = -32020;
    static final int UNSUPPORTED_VERSION = -32022;

    private static final Set<String> NAMED_METHODS =
            Set.of("tools/call", "resources/read", "prompts/get");
    private static final String B64_PREFIX = "=?base64?";
    private static final String B64_SUFFIX = "?=";

    private McpModernProtocol() {}

    /** Every version this server speaks, newest first. */
    static List<String> supportedVersions() {
        List<String> all = new ArrayList<>();
        all.add(VERSION);
        all.addAll(LEGACY_VERSIONS);
        return all;
    }

    /** The version declared in the request's {@code _meta}, or null. */
    static String metaVersion(JsonRpcRequest request) {
        JsonNode version = meta(request).get(VERSION_KEY);
        return version != null && version.isTextual() ? version.asText() : null;
    }

    /** Modern requests carry the version in {@code _meta}, or at least a non-legacy header. */
    static boolean isModern(JsonRpcRequest request, String headerVersion) {
        return metaVersion(request) != null
                || (headerVersion != null && !LEGACY_VERSIONS.contains(headerVersion.trim()));
    }

    /** The error for an invalid modern request, or null when it can be served. */
    static JsonRpcError validate(JsonRpcRequest request, HttpHeaders headers, ObjectMapper mapper) {
        String metaVersion = metaVersion(request);
        String headerVersion = headers.getFirst(VERSION_HEADER);
        String requested = metaVersion != null ? metaVersion : headerVersion;
        if (!VERSION.equals(requested)) {
            ObjectNode data = mapper.createObjectNode();
            supportedVersions().forEach(data.putArray("supported")::add);
            data.put("requested", requested);
            return new JsonRpcError(UNSUPPORTED_VERSION, "Unsupported protocol version", data);
        }
        if (metaVersion == null) {
            return JsonRpcError.invalidParams("Missing _meta \"" + VERSION_KEY + "\"");
        }
        JsonNode capabilities = meta(request).get(CAPABILITIES_KEY);
        if (capabilities == null || !capabilities.isObject()) {
            return JsonRpcError.invalidParams("Missing _meta \"" + CAPABILITIES_KEY + "\"");
        }
        if (!metaVersion.equals(headerVersion)) {
            return mismatch(VERSION_HEADER, headerVersion, metaVersion);
        }
        String methodHeader = headers.getFirst(METHOD_HEADER);
        if (!request.method().equals(methodHeader)) {
            return mismatch(METHOD_HEADER, methodHeader, request.method());
        }
        if (NAMED_METHODS.contains(request.method())) {
            String expected = nameOf(request);
            String nameHeader = decode(headers.getFirst(NAME_HEADER));
            if (expected == null || !expected.equals(nameHeader)) {
                return mismatch(NAME_HEADER, headers.getFirst(NAME_HEADER), expected);
            }
        }
        return null;
    }

    private static JsonRpcError mismatch(String header, String actual, String expected) {
        String message =
                actual == null
                        ? "Header mismatch: " + header + " header is required"
                        : "Header mismatch: "
                                + header
                                + " header value '"
                                + actual
                                + "' does not match body value '"
                                + expected
                                + "'";
        return new JsonRpcError(HEADER_MISMATCH, message, null);
    }

    private static String nameOf(JsonRpcRequest request) {
        JsonNode params = request.params();
        if (params == null) {
            return null;
        }
        JsonNode value =
                "resources/read".equals(request.method()) ? params.get("uri") : params.get("name");
        return value != null && value.isTextual() ? value.asText() : null;
    }

    /** Undo the {@code =?base64?...?=} sentinel; null when the value cannot be decoded. */
    static String decode(String value) {
        if (value == null || !value.startsWith(B64_PREFIX) || !value.endsWith(B64_SUFFIX)) {
            return value;
        }
        String encoded = value.substring(B64_PREFIX.length(), value.length() - B64_SUFFIX.length());
        try {
            return new String(Base64.getDecoder().decode(encoded), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private static JsonNode meta(JsonRpcRequest request) {
        JsonNode params = request.params();
        JsonNode meta = params == null ? null : params.get("_meta");
        return meta != null && meta.isObject() ? meta : MissingNode.getInstance();
    }
}
