package stirling.software.proprietary.mcp.jsonrpc;

import com.fasterxml.jackson.annotation.JsonInclude;

import tools.jackson.databind.JsonNode;

/** JSON-RPC 2.0 request frame; a null {@code id} marks a notification. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record JsonRpcRequest(String jsonrpc, JsonNode id, String method, JsonNode params) {

    public boolean isNotification() {
        return id == null || id.isNull();
    }
}
