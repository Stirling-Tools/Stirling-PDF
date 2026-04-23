package stirling.software.SPDF.config;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import java.lang.reflect.Field;
import java.util.HashMap;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationContext;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

class EndpointInspectorTest {

    private ApplicationContext applicationContext;
    private EndpointInspector inspector;

    @BeforeEach
    void setUp() {
        applicationContext = mock(ApplicationContext.class);
        inspector = new EndpointInspector(applicationContext);
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
        when(applicationContext.getBeansOfType(RequestMappingHandlerMapping.class))
                .thenReturn(new HashMap<>());
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
     * endpoints as discovered.
     */
    private void addEndpoints(String... endpoints) throws Exception {
        // First trigger discovery with empty context so fallback doesn't interfere
        when(applicationContext.getBeansOfType(RequestMappingHandlerMapping.class))
                .thenReturn(new HashMap<>());

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
