package stirling.software.proprietary.mcp.catalog;

/** Exposes the catalog's package-private id rules to tests in other packages. */
public final class McpToolCatalogTestAccess {

    private McpToolCatalogTestAccess() {}

    public static String opId(String pattern, OperationCategory category) {
        return McpToolCatalog.extractOpId(pattern, category);
    }
}
