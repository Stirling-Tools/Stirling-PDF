package stirling.software.proprietary.mcp.tools;

import io.quarkus.arc.lookup.LookupIfProperty;

import jakarta.enterprise.inject.Instance;
import jakarta.inject.Singleton;

import stirling.software.proprietary.mcp.catalog.McpToolCatalog;
import stirling.software.proprietary.mcp.catalog.OperationCategory;

import tools.jackson.databind.ObjectMapper;

/** Exposes the {@code /api/v1/convert/*} namespace as a single MCP tool. */
// MIGRATION: @Singleton (not @ApplicationScoped) - extends AbstractCategoryTool, which has no
// no-arg constructor, so a proxied normal-scoped bean is impossible. Stateless, so equivalent.
@Singleton
@LookupIfProperty(name = "mcp.enabled", stringValue = "true")
public class StirlingConvertTool extends AbstractCategoryTool {

    public StirlingConvertTool(
            ObjectMapper mapper,
            Instance<McpToolCatalog> catalog,
            Instance<McpOperationExecutor> executor) {
        super(mapper, catalog, executor);
    }

    @Override
    public String name() {
        return "stirling_convert";
    }

    @Override
    public String description() {
        return "Convert files between PDF and other formats (PDF<->Word, PDF<->image, HTML->PDF,"
                + " etc.). Inspect the `operation` enum, then call stirling_describe_operation"
                + " with the chosen op to get its parameters JSON Schema before calling this"
                + " tool.";
    }

    @Override
    protected OperationCategory category() {
        return OperationCategory.CONVERT;
    }
}
