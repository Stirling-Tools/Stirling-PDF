package stirling.software.proprietary.mcp.tools;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import stirling.software.proprietary.mcp.catalog.McpToolCatalog;
import stirling.software.proprietary.mcp.catalog.OperationCategory;

import tools.jackson.databind.ObjectMapper;

/** Exposes the {@code /api/v1/general/*} (page operations) namespace as a single MCP tool. */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class StirlingPagesTool extends AbstractCategoryTool {

    public StirlingPagesTool(
            ObjectMapper mapper,
            ObjectProvider<McpToolCatalog> catalog,
            ObjectProvider<McpOperationExecutor> executor) {
        super(mapper, catalog, executor);
    }

    @Override
    public String name() {
        return "stirling_pages";
    }

    @Override
    public String title() {
        return "Merge, split and rotate pages";
    }

    @Override
    public String description() {
        return "Work with PDF pages and structure: merge, split (by pages, size, chapters or"
                + " sections), extract, reorder or remove pages, rotate, crop, scale, page layouts"
                + " and booklets, overlay PDFs, find and replace text, and edit bookmarks."
                + " Each operation lists its parameters in the 'operation' field; call"
                + " stirling_describe_operation when an option you need is not shown.";
    }

    @Override
    protected OperationCategory category() {
        return OperationCategory.PAGES;
    }
}
