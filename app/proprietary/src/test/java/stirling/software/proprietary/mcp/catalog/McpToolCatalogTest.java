package stirling.software.proprietary.mcp.catalog;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationContext;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.model.ApplicationProperties;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/** Catalog tests: DELETE/GET exclusion and disabled-PDF-op AI fall-through. */
class McpToolCatalogTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void isInvocableMethod_excludesDeleteAndGet() {
        assertTrue(McpToolCatalog.isInvocableMethod(Set.of(RequestMethod.POST)));
        assertTrue(McpToolCatalog.isInvocableMethod(Set.of(RequestMethod.PUT)));
        // DELETE/GET handlers must never be cataloged as runnable tools.
        assertFalse(McpToolCatalog.isInvocableMethod(Set.of(RequestMethod.DELETE)));
        assertFalse(McpToolCatalog.isInvocableMethod(Set.of(RequestMethod.GET)));
        // Empty method set (matches all verbs) is not invocable.
        assertFalse(McpToolCatalog.isInvocableMethod(Set.of()));
        // Multi-verb mapping including POST stays invocable.
        assertTrue(
                McpToolCatalog.isInvocableMethod(Set.of(RequestMethod.POST, RequestMethod.DELETE)));
    }

    @Test
    void findByOperationId_disabledPdfOp_doesNotFallThroughToAi() throws Exception {
        ApplicationContext ctx = mock(ApplicationContext.class);
        when(ctx.getBeansOfType(RequestMappingHandlerMapping.class)).thenReturn(Map.of());
        EndpointConfiguration endpoints = mock(EndpointConfiguration.class);
        // The PDF op's endpoint is disabled.
        when(endpoints.isEndpointEnabledForUri(anyString())).thenReturn(false);

        McpToolCatalog catalog =
                new McpToolCatalog(ctx, endpoints, new ApplicationProperties(), mapper);

        ObjectNode schema = mapper.createObjectNode();
        OperationMeta pdf =
                new OperationMeta(
                        "collide",
                        OperationCategory.MISC,
                        "pdf op",
                        schema,
                        "mcp.tools.write",
                        OperationMeta.Target.JAVA_ENDPOINT,
                        "/api/v1/misc/collide",
                        null);
        OperationMeta ai =
                new OperationMeta(
                        "collide",
                        OperationCategory.AI,
                        "ai op",
                        schema,
                        "mcp.tools.write",
                        OperationMeta.Target.ENGINE_CAPABILITY,
                        "collide",
                        null);
        seed(catalog, "pdfOps", "collide", pdf);
        seed(catalog, "aiOps", "collide", ai);

        // A disabled PDF op must resolve to empty, not a colliding AI capability of the same id.
        assertTrue(
                catalog.findByOperationId("collide").isEmpty(),
                "disabled PDF op must not resolve to a colliding AI capability");

        // A genuine AI-only id still resolves.
        seed(
                catalog,
                "aiOps",
                "ai-only",
                new OperationMeta(
                        "ai-only",
                        OperationCategory.AI,
                        "ai op",
                        schema,
                        "mcp.tools.write",
                        OperationMeta.Target.ENGINE_CAPABILITY,
                        "ai-only",
                        null));
        assertEquals("ai-only", catalog.findByOperationId("ai-only").orElseThrow().id());
    }

    @Test
    void blockedOperations_hidesOp() throws Exception {
        ApplicationProperties props = new ApplicationProperties();
        props.getMcp().setBlockedOperations(List.of("compress-pdf"));
        McpToolCatalog catalog = catalogWithEndpointsEnabled(props);
        seed(catalog, "pdfOps", "compress-pdf", miscOp("compress-pdf"));
        seed(catalog, "pdfOps", "ocr-pdf", miscOp("ocr-pdf"));

        assertTrue(
                catalog.findByOperationId("compress-pdf").isEmpty(), "blocked op must be hidden");
        assertEquals("ocr-pdf", catalog.findByOperationId("ocr-pdf").orElseThrow().id());
        assertFalse(idsOf(catalog).contains("compress-pdf"));
        assertTrue(idsOf(catalog).contains("ocr-pdf"));
    }

    @Test
    void allowedOperations_isWhitelist() throws Exception {
        ApplicationProperties props = new ApplicationProperties();
        props.getMcp().setAllowedOperations(List.of("compress-pdf"));
        McpToolCatalog catalog = catalogWithEndpointsEnabled(props);
        seed(catalog, "pdfOps", "compress-pdf", miscOp("compress-pdf"));
        seed(catalog, "pdfOps", "ocr-pdf", miscOp("ocr-pdf"));

        assertEquals("compress-pdf", catalog.findByOperationId("compress-pdf").orElseThrow().id());
        assertTrue(
                catalog.findByOperationId("ocr-pdf").isEmpty(),
                "op not on the allow-list must be hidden");
        assertEquals(List.of("compress-pdf"), idsOf(catalog));
    }

    @Test
    void blockedOperations_takePrecedenceOverAllowed() throws Exception {
        ApplicationProperties props = new ApplicationProperties();
        props.getMcp().setAllowedOperations(List.of("compress-pdf"));
        props.getMcp().setBlockedOperations(List.of("compress-pdf"));
        McpToolCatalog catalog = catalogWithEndpointsEnabled(props);
        seed(catalog, "pdfOps", "compress-pdf", miscOp("compress-pdf"));

        assertTrue(
                catalog.findByOperationId("compress-pdf").isEmpty(),
                "block-list must win over allow-list");
    }

    @Test
    void emptyAllowAndBlockLists_exposeAllEnabledOps() throws Exception {
        McpToolCatalog catalog = catalogWithEndpointsEnabled(new ApplicationProperties());
        seed(catalog, "pdfOps", "compress-pdf", miscOp("compress-pdf"));

        assertEquals("compress-pdf", catalog.findByOperationId("compress-pdf").orElseThrow().id());
        assertTrue(idsOf(catalog).contains("compress-pdf"));
    }

    private McpToolCatalog catalogWithEndpointsEnabled(ApplicationProperties props) {
        ApplicationContext ctx = mock(ApplicationContext.class);
        when(ctx.getBeansOfType(RequestMappingHandlerMapping.class)).thenReturn(Map.of());
        EndpointConfiguration endpoints = mock(EndpointConfiguration.class);
        when(endpoints.isEndpointEnabledForUri(anyString())).thenReturn(true);
        return new McpToolCatalog(ctx, endpoints, props, mapper);
    }

    private OperationMeta miscOp(String id) {
        return new OperationMeta(
                id,
                OperationCategory.MISC,
                id,
                mapper.createObjectNode(),
                "mcp.tools.write",
                OperationMeta.Target.JAVA_ENDPOINT,
                "/api/v1/misc/" + id,
                null);
    }

    private static List<String> idsOf(McpToolCatalog catalog) {
        return catalog.enabledOps(OperationCategory.MISC).stream().map(OperationMeta::id).toList();
    }

    @SuppressWarnings("unchecked")
    private static void seed(McpToolCatalog catalog, String field, String id, OperationMeta meta)
            throws Exception {
        Field f = McpToolCatalog.class.getDeclaredField(field);
        f.setAccessible(true);
        ((Map<String, OperationMeta>) f.get(catalog)).put(id, meta);
    }
}
