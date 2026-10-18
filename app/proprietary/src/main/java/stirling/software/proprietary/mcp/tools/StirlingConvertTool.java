package stirling.software.proprietary.mcp.tools;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import stirling.software.proprietary.mcp.McpToolAnnotations;
import stirling.software.proprietary.mcp.catalog.McpToolCatalog;
import stirling.software.proprietary.mcp.catalog.OperationCategory;

import tools.jackson.databind.ObjectMapper;

/** Exposes the {@code /api/v1/convert/*} namespace as a single MCP tool. */
@Component
@ConditionalOnProperty(name = "mcp.enabled", havingValue = "true")
public class StirlingConvertTool extends AbstractCategoryTool {

    public StirlingConvertTool(
            ObjectMapper mapper,
            ObjectProvider<McpToolCatalog> catalog,
            ObjectProvider<McpOperationExecutor> executor) {
        super(mapper, catalog, executor);
    }

    @Override
    public String name() {
        return "stirling_convert";
    }

    @Override
    public String title() {
        return "Convert to or from PDF";
    }

    @Override
    public String description() {
        return "Convert files to and from PDF: Word, Excel, PowerPoint and other office files,"
                + " images, HTML, Markdown, email, e-books, comics, PostScript, text, tables (CSV,"
                + " Excel), XML, PDF/A and accessible PDF/UA. A scanned PDF has no text to"
                + " convert, so run ocr-pdf on it first. To make a PDF from HTML or Markdown you"
                + " write, send it base64 in 'file' with fileName ending .html or .md."
                + " Each operation lists its parameters in the 'operation' field; call"
                + " stirling_describe_operation when an option you need is not shown.";
    }

    @Override
    protected OperationCategory category() {
        return OperationCategory.CONVERT;
    }

    @Override
    public McpToolAnnotations annotations() {
        // url-to-pdf fetches arbitrary web pages.
        return McpToolAnnotations.PRODUCES_FILE_OPEN_WORLD;
    }
}
