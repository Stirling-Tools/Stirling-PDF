package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.*;

import java.lang.reflect.Field;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class EndpointInspectorTest {

    private EndpointInspector inspector;

    @BeforeEach
    void setUp() {
        // MIGRATION: EndpointInspector no longer takes a Spring ApplicationContext. Under Quarkus
        // it has no runtime-queryable handler-mapping registry (the Spring
        // RequestMappingHandlerMapping enumeration is gone - see
        // EndpointInspector.discoverEndpoints
        // TODO), so it is constructed no-arg and discovery falls back to the common wildcard set.
        inspector = new EndpointInspector();
    }

    @Test
    void isValidGetEndpointReturnsTrueForExactMatch() throws Exception {
        addEndpoints("/home", "/about");
        assertTrue(inspector.isValidGetEndpoint("/home"));
    }

    @Test
    void isValidGetEndpointReturnsFalseForUnknownEndpoint() throws Exception {
        addEndpoints("/home");
        assertFalse(inspector.isValidGetEndpoint("/unknown"));
    }

    @Test
    void isValidGetEndpointMatchesWildcardPattern() throws Exception {
        addEndpoints("/api/**");
        assertTrue(inspector.isValidGetEndpoint("/api/v1/test"));
    }

    @Test
    void isValidGetEndpointMatchesPathVariablePattern() throws Exception {
        addEndpoints("/users/{id}");
        assertTrue(inspector.isValidGetEndpoint("/users/123"));
    }

    @Test
    void isValidGetEndpointMatchesPathSegments() throws Exception {
        addEndpoints("/api/v1/convert");
        assertTrue(inspector.isValidGetEndpoint("/api/v1/convert/extra"));
    }

    @Test
    void isValidGetEndpointReturnsFalseForPartialNonMatch() throws Exception {
        addEndpoints("/api/v1/convert");
        assertFalse(inspector.isValidGetEndpoint("/other/path"));
    }

    @Test
    void getValidGetEndpointsReturnsDefensiveCopy() throws Exception {
        addEndpoints("/home");
        Set<String> first = inspector.getValidGetEndpoints();
        Set<String> second = inspector.getValidGetEndpoints();
        assertEquals(first, second);
        assertNotSame(first, second);
    }

    @Test
    void discoverEndpointsAddsFallbackWhenNoMappingsFound() {
        // A fresh inspector (no endpoints injected) triggers discovery on first access, which
        // falls back to the common wildcard endpoints (preserving the prior Spring behavior when
        // no handler mappings were found).
        Set<String> endpoints = inspector.getValidGetEndpoints();
        assertTrue(endpoints.contains("/"));
        assertTrue(endpoints.contains("/**"));
    }

    @Test
    void wildcardPatternDoesNotMatchDifferentPrefix() throws Exception {
        addEndpoints("/admin/*");
        assertFalse(inspector.isValidGetEndpoint("/user/test"));
    }

    @Test
    void pathVariableWithDifferentPrefixDoesNotMatch() throws Exception {
        addEndpoints("/orders/{id}");
        assertFalse(inspector.isValidGetEndpoint("/products/123"));
    }

    /**
     * Helper to inject endpoints directly into the inspector's validGetEndpoints field and mark
     * endpoints as discovered, bypassing the (now fallback-only) discovery pass.
     */
    private void addEndpoints(String... endpoints) throws Exception {
        Field validGetEndpointsField =
                EndpointInspector.class.getDeclaredField("validGetEndpoints");
        validGetEndpointsField.setAccessible(true);
        @SuppressWarnings("unchecked")
        Set<String> set = (Set<String>) validGetEndpointsField.get(inspector);
        set.clear();
        for (String ep : endpoints) {
            set.add(ep);
        }

        Field discoveredField = EndpointInspector.class.getDeclaredField("endpointsDiscovered");
        discoveredField.setAccessible(true);
        discoveredField.setBoolean(inspector, true);
    }
}
