package stirling.software.proprietary.mcp.jsonrpc;

import com.fasterxml.jackson.annotation.JsonInclude;

import tools.jackson.databind.JsonNode;

/** JSON-RPC 2.0 response; exactly one of {@code result} or {@code error} is non-null. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record JsonRpcResponse(String jsonrpc, JsonNode id, Object result, JsonRpcError error) {

    public static JsonRpcResponse success(JsonNode id, Object result) {
        return new JsonRpcResponse("2.0", id, result, null);
    }

    public static JsonRpcResponse failure(JsonNode id, JsonRpcError error) {
        return new JsonRpcResponse("2.0", id, null, error);
    }
}
