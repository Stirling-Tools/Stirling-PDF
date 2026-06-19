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

import org.junit.jupiter.api.Test;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.common.model.ApplicationProperties;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

/**
 * Catalog tests: DELETE/GET exclusion and disabled-PDF-op AI fall-through.
 *
 * <p>MIGRATION (Spring MVC -> Quarkus): {@code McpToolCatalog} no longer takes a Spring {@code
 * ApplicationContext} (endpoint discovery via {@code RequestMappingHandlerMapping} was removed -
 * see the class TODO), so the constructor is now {@code (EndpointConfiguration,
 * ApplicationProperties, ObjectMapper)}. The {@code isInvocableMethod(Set<RequestMethod>)} helper
 * was removed along with the Spring-MVC discovery path, so that test is dropped (no current
 * production method to assert). The allow/block-list filtering and the disabled-op fall-through
 * behaviour are unchanged and remain fully covered.
 */
class McpToolCatalogTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void findByOperationId_disabledPdfOp_doesNotFallThroughToAi() throws Exception {
        EndpointConfiguration endpoints = mock(EndpointConfiguration.class);
        // The PDF op's endpoint is disabled.
        when(endpoints.isEndpointEnabledForUri(anyString())).thenReturn(false);

        McpToolCatalog catalog = new McpToolCatalog(endpoints, new ApplicationProperties(), mapper);

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
        EndpointConfiguration endpoints = mock(EndpointConfiguration.class);
        when(endpoints.isEndpointEnabledForUri(anyString())).thenReturn(true);
        return new McpToolCatalog(endpoints, props, mapper);
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
