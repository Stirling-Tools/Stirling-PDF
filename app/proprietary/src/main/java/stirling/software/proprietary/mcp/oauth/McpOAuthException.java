package stirling.software.proprietary.mcp.oauth;

import lombok.Getter;

/** An OAuth error to render as {@code {"error": ..., "error_description": ...}} with a status. */
@Getter
public class McpOAuthException extends RuntimeException {

    private final String error;
    private final int status;

    public McpOAuthException(String error, String description, int status) {
        super(description);
        this.error = error;
        this.status = status;
    }

    public static McpOAuthException invalidRequest(String description) {
        return new McpOAuthException("invalid_request", description, 400);
    }

    public static McpOAuthException invalidClient(String description) {
        return new McpOAuthException("invalid_client", description, 401);
    }

    public static McpOAuthException invalidGrant(String description) {
        return new McpOAuthException("invalid_grant", description, 400);
    }

    public static McpOAuthException unsupported(String description) {
        return new McpOAuthException("unsupported_grant_type", description, 400);
    }
}
