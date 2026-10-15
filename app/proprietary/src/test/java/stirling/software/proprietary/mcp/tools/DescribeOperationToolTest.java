package stirling.software.proprietary.mcp.tools;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.method.HandlerMethod;

import io.swagger.v3.oas.annotations.Operation;

import stirling.software.proprietary.mcp.McpCallContext;
import stirling.software.proprietary.mcp.catalog.McpToolCatalog;
import stirling.software.proprietary.mcp.catalog.OperationCategory;
import stirling.software.proprietary.mcp.catalog.OperationMeta;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

class DescribeOperationToolTest {

    private final ObjectMapper mapper = new ObjectMapper();

    static class SplitController {
        @Operation(
                summary = "Auto split",
                description = "Splits only at QR divider sheets; otherwise use split-pages.")
        public void split(org.springframework.web.multipart.MultipartFile fileInput) {}
    }

    @Test
    @SuppressWarnings("unchecked")
    void describeShowsDetailsAndLeavesTheMainInputOutOfParameters() throws Exception {
        ObjectNode schema =
                (ObjectNode)
                        mapper.readTree(
                                """
                                {"type":"object","required":["fileInput","duplexMode"],
                                 "properties":{"fileInput":{"type":"string","format":"file-id"},
                                 "fileId":{"type":"string"},"duplexMode":{"type":"boolean"}}}
                                """);
        HandlerMethod handler =
                new HandlerMethod(
                        new SplitController(),
                        SplitController.class.getMethod(
                                "split", org.springframework.web.multipart.MultipartFile.class));
        OperationMeta meta =
                new OperationMeta(
                        "auto-split-pdf",
                        OperationCategory.MISC,
                        "Auto split",
                        schema,
                        "mcp.tools.write",
                        OperationMeta.Target.JAVA_ENDPOINT,
                        "/api/v1/misc/auto-split-pdf",
                        handler);
        McpToolCatalog catalog = mock(McpToolCatalog.class);
        when(catalog.findByOperationId("auto-split-pdf")).thenReturn(Optional.of(meta));
        ObjectProvider<McpToolCatalog> provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(catalog);
        DescribeOperationTool tool = new DescribeOperationTool(mapper, provider);
        ObjectNode args = mapper.createObjectNode().put("operation", "auto-split-pdf");

        ObjectNode result =
                tool.call(args, new McpCallContext(null, Set.of("mcp.tools.read"), false));
        JsonNode payload = mapper.readTree(result.get("content").get(0).get("text").asText());

        assertEquals(
                "Splits only at QR divider sheets; otherwise use split-pages.",
                payload.get("details").asText());
        assertTrue(payload.get("input").asText().contains("top level"));
        JsonNode params = payload.get("parametersSchema");
        assertFalse(params.get("properties").has("fileInput"));
        assertFalse(params.get("properties").has("fileId"));
        assertEquals(1, params.get("required").size());
        assertTrue(meta.paramSchema().get("properties").has("fileInput"), "catalog untouched");
    }
}
