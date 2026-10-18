package stirling.software.proprietary.mcp.tools;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import stirling.software.proprietary.mcp.catalog.McpToolCatalog;
import stirling.software.proprietary.mcp.catalog.OperationCategory;

import tools.jackson.databind.ObjectMapper;

/** Exposes the {@code /api/v1/misc/*} namespace as a single MCP tool. */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class StirlingMiscTool extends AbstractCategoryTool {

    public StirlingMiscTool(
            ObjectMapper mapper,
            ObjectProvider<McpToolCatalog> catalog,
            ObjectProvider<McpOperationExecutor> executor) {
        super(mapper, catalog, executor);
    }

    @Override
    public String name() {
        return "stirling_misc";
    }

    @Override
    public String title() {
        return "Compress, OCR and tidy PDFs";
    }

    @Override
    public String description() {
        return "Other PDF tools: fill in and read form fields, compress, OCR, stamps, page"
                + " numbers, images, attachments and portfolios, metadata, comments, flatten,"
                + " repair, auto-rotate, remove blank pages and similar utilities. Watermarks are"
                + " in stirling_security."
                + " Each operation lists its parameters in the 'operation' field; call"
                + " stirling_describe_operation when an option you need is not shown.";
    }

    @Override
    protected OperationCategory category() {
        return OperationCategory.MISC;
    }
}
