package stirling.software.proprietary.mcp.tools;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.catalog.McpToolCatalog;
import stirling.software.proprietary.mcp.catalog.OperationCategory;
import stirling.software.proprietary.mcp.catalog.OperationMeta;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * PDF category tools must not fake success: a bad/missing op returns the operation list, a valid
 * scoped op delegates to the executor, and a missing scope is refused.
 */
class CategoryToolDispatchTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private OperationMeta miscOp() {
        return new OperationMeta(
                "compress-pdf",
                OperationCategory.MISC,
                "Compress a PDF",
                mapper.createObjectNode(),
                "mcp.tools.write",
                OperationMeta.Target.JAVA_ENDPOINT,
                "/api/v1/misc/compress-pdf",
                null);
    }

    private McpOperationExecutor executorReturning(ObjectNode sentinel) {
        McpOperationExecutor executor = mock(McpOperationExecutor.class);
        when(executor.execute(any(), any())).thenReturn(sentinel);
        return executor;
    }

    private StirlingMiscTool toolWith(McpOperationExecutor executor) {
        OperationMeta meta = miscOp();
        McpToolCatalog catalog = mock(McpToolCatalog.class);
        when(catalog.findByOperationId("compress-pdf")).thenReturn(Optional.of(meta));
        when(catalog.enabledOps(OperationCategory.MISC)).thenReturn(List.of(meta));
        @SuppressWarnings("unchecked")
        ObjectProvider<McpToolCatalog> catalogProvider = mock(ObjectProvider.class);
        when(catalogProvider.getIfAvailable()).thenReturn(catalog);
        @SuppressWarnings("unchecked")
        ObjectProvider<McpOperationExecutor> executorProvider = mock(ObjectProvider.class);
        when(executorProvider.getIfAvailable()).thenReturn(executor);
        return new StirlingMiscTool(mapper, catalogProvider, executorProvider);
    }

    private ObjectNode args(String op) {
        ObjectNode a = mapper.createObjectNode();
        if (op != null) {
            a.put("operation", op);
        }
        return a;
    }

    private String textOf(ObjectNode result) {
        return result.get("content").get(0).get("text").asText();
    }

    @Test
    void validOpWithScope_delegatesToExecutor() {
        ObjectNode sentinel = McpResponses.text(mapper, "EXECUTED");
        StirlingMiscTool tool = toolWith(executorReturning(sentinel));
        McpCallContext ctx = new McpCallContext("user", Set.of("mcp.tools.write"), true);

        ObjectNode result = tool.call(args("compress-pdf"), ctx);

        assertEquals("EXECUTED", textOf(result), "valid scoped op must run via the executor");
    }

    @Test
    void unknownOperation_returnsAvailableOperationList() {
        StirlingMiscTool tool = toolWith(executorReturning(mapper.createObjectNode()));
        McpCallContext ctx = new McpCallContext("user", Set.of("mcp.tools.write"), true);

        ObjectNode result = tool.call(args("does-not-exist"), ctx);

        assertTrue(result.path("isError").asBoolean(false));
        String text = textOf(result);
        assertTrue(text.contains("Available operations"), "should list available ops: " + text);
        assertTrue(text.contains("compress-pdf"), "should include the valid op id: " + text);
    }

    @Test
    void missingOperation_returnsAvailableOperationList() {
        StirlingMiscTool tool = toolWith(executorReturning(mapper.createObjectNode()));
        McpCallContext ctx = new McpCallContext("user", Set.of("mcp.tools.write"), true);

        ObjectNode result = tool.call(args(null), ctx);

        assertTrue(result.path("isError").asBoolean(false));
        assertTrue(textOf(result).contains("Available operations"));
    }

    @Test
    void missingScope_returnsScopeError() {
        StirlingMiscTool tool = toolWith(executorReturning(mapper.createObjectNode()));
        McpCallContext ctx = new McpCallContext("user", Set.of("mcp.tools.read"), true);

        ObjectNode result = tool.call(args("compress-pdf"), ctx);

        assertTrue(result.path("isError").asBoolean(false));
        assertTrue(textOf(result).toLowerCase().contains("scope"));
    }
}
