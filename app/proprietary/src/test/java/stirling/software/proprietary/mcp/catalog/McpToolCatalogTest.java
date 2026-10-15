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

/** Catalog tests: DELETE/GET exclusion, admin filters and AI feature switches. */
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
    void aiTools_followTheAiEngineFeatureSwitches() throws Exception {
        ApplicationProperties props = new ApplicationProperties();
        McpToolCatalog catalog = catalogWithEndpointsEnabled(props);
        seed(catalog, "pdfOps", "math-auditor-agent", aiOp("math-auditor-agent"));
        seed(catalog, "pdfOps", "unknown-agent", aiOp("unknown-agent"));

        props.getAiEngine().setEnabled(false);
        assertTrue(catalog.findByOperationId("math-auditor-agent").isEmpty());

        props.getAiEngine().setEnabled(true);
        assertEquals(
                List.of("math-auditor-agent"),
                catalog.enabledOps(OperationCategory.AI).stream().map(OperationMeta::id).toList());

        props.getAiEngine().getFeatures().setMathAuditor(false);
        assertTrue(catalog.findByOperationId("math-auditor-agent").isEmpty());
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

    private OperationMeta aiOp(String id) {
        return new OperationMeta(
                id,
                OperationCategory.AI,
                id,
                mapper.createObjectNode(),
                "mcp.tools.write",
                OperationMeta.Target.JAVA_ENDPOINT,
                "/api/v1/ai/tools/" + id,
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
