package stirling.software.proprietary.mcp.catalog;

/** MCP tool categories; {@link #urlPrefix} maps a {@code /api/v1/} namespace to a category. */
public enum OperationCategory {
    CONVERT("/api/v1/convert/", "stirling_convert"),
    PAGES("/api/v1/general/", "stirling_pages"),
    MISC("/api/v1/misc/", "stirling_misc"),
    SECURITY("/api/v1/security/", "stirling_security"),
    AI(null, "stirling_ai");

    private final String urlPrefix;
    private final String toolName;

    OperationCategory(String urlPrefix, String toolName) {
        this.urlPrefix = urlPrefix;
        this.toolName = toolName;
    }

    public String urlPrefix() {
        return urlPrefix;
    }

    public String toolName() {
        return toolName;
    }

    public static OperationCategory fromUrl(String url) {
        if (url == null) {
            return null;
        }
        for (OperationCategory c : values()) {
            if (c.urlPrefix != null && url.startsWith(c.urlPrefix)) {
                return c;
            }
        }
        return null;
    }
}
