package stirling.software.proprietary.mcp.tools;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import stirling.software.proprietary.mcp.catalog.McpToolCatalog;
import stirling.software.proprietary.mcp.catalog.OperationCategory;

import tools.jackson.databind.ObjectMapper;

/** Exposes the {@code /api/v1/ai/tools/*} namespace, billed and authorized like any call. */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class StirlingAiTool extends AbstractCategoryTool {

    public StirlingAiTool(
            ObjectMapper mapper,
            ObjectProvider<McpToolCatalog> catalog,
            ObjectProvider<McpOperationExecutor> executor) {
        super(mapper, catalog, executor);
    }

    @Override
    public String name() {
        return "stirling_ai";
    }

    @Override
    public String title() {
        return "AI tools for PDFs";
    }

    @Override
    public boolean available() {
        return !enabledOperations().isEmpty();
    }

    @Override
    public String analyticsCategory() {
        return "ai";
    }

    @Override
    public String description() {
        return "Stirling's AI document tools: build a designed PDF (invoice, letter, report) from"
                + " structured content with no input file, audit a PDF's maths, add AI review"
                + " comments, or classify and label a PDF. Each operation lists its parameters"
                + " in the 'operation' field.";
    }

    @Override
    protected OperationCategory category() {
        return OperationCategory.AI;
    }
}
