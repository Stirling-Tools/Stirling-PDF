package stirling.software.proprietary.mcp.jsonrpc;

import com.fasterxml.jackson.annotation.JsonInclude;

import tools.jackson.databind.JsonNode;

/** JSON-RPC 2.0 error object. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record JsonRpcError(int code, String message, JsonNode data) {

    public static final int PARSE_ERROR = -32700;
    public static final int INVALID_REQUEST = -32600;
    public static final int METHOD_NOT_FOUND = -32601;
    public static final int INVALID_PARAMS = -32602;
    public static final int INTERNAL_ERROR = -32603;

    public static JsonRpcError parseError(String message) {
        return new JsonRpcError(PARSE_ERROR, message, null);
    }

    public static JsonRpcError invalidRequest(String message) {
        return new JsonRpcError(INVALID_REQUEST, message, null);
    }

    public static JsonRpcError methodNotFound(String method) {
        return new JsonRpcError(METHOD_NOT_FOUND, "Method not found: " + method, null);
    }

    public static JsonRpcError invalidParams(String message) {
        return new JsonRpcError(INVALID_PARAMS, message, null);
    }

    public static JsonRpcError internalError(String message) {
        return new JsonRpcError(INTERNAL_ERROR, message, null);
    }
}
