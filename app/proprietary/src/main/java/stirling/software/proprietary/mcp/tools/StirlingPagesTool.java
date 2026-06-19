package stirling.software.proprietary.mcp.tools;

import io.quarkus.arc.lookup.LookupIfProperty;

import jakarta.enterprise.inject.Instance;
import jakarta.inject.Singleton;

import stirling.software.proprietary.mcp.catalog.McpToolCatalog;
import stirling.software.proprietary.mcp.catalog.OperationCategory;

import tools.jackson.databind.ObjectMapper;

/** Exposes the {@code /api/v1/general/*} (page operations) namespace as a single MCP tool. */
// MIGRATION: @Singleton (not @ApplicationScoped) because this bean extends AbstractCategoryTool,
// which has no no-arg constructor. A normal-scoped bean needs a client proxy and therefore a
// non-private no-arg constructor; @Singleton beans are not proxied, so they wire cleanly. The tool
// is stateless, so singleton scope is behaviourally equivalent here.
@Singleton
@LookupIfProperty(name = "mcp.enabled", stringValue = "true")
public class StirlingPagesTool extends AbstractCategoryTool {

    public StirlingPagesTool(
            ObjectMapper mapper,
            Instance<McpToolCatalog> catalog,
            Instance<McpOperationExecutor> executor) {
        super(mapper, catalog, executor);
    }

    @Override
    public String name() {
        return "stirling_pages";
    }

    @Override
    public String description() {
        return "Manipulate PDF pages: merge, split, rotate, rearrange, crop, delete, overlay,"
                + " add blank pages. Call stirling_describe_operation with the chosen op to get"
                + " its parameters schema before invoking this tool.";
    }

    @Override
    protected OperationCategory category() {
        return OperationCategory.PAGES;
    }
}
