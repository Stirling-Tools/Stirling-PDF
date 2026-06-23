package stirling.software.SPDF.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationContext;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.support.StaticApplicationContext;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

@DisplayName("EndpointInspector (additional coverage)")
class EndpointInspectorMoreTest {

    private ApplicationContext applicationContext;
    private EndpointInspector inspector;

    // Simple controller bean providing a handler method for HandlerMethod construction.
    static class DummyController {
        public String handle() {
            return "ok";
        }
    }

    @BeforeEach
    void setUp() {
        applicationContext = mock(ApplicationContext.class);
        inspector = new EndpointInspector(applicationContext);
    }

    private HandlerMethod handlerMethod() throws Exception {
        Method method = DummyController.class.getMethod("handle");
        return new HandlerMethod(new DummyController(), method);
    }

    @SuppressWarnings("unchecked")
    private Set<String> validEndpoints() throws Exception {
        Field field = EndpointInspector.class.getDeclaredField("validGetEndpoints");
        field.setAccessible(true);
        return (Set<String>) field.get(inspector);
    }

    private void stubMapping(Map<RequestMappingInfo, HandlerMethod> handlerMethods) {
        RequestMappingHandlerMapping mapping = mock(RequestMappingHandlerMapping.class);
        when(mapping.getHandlerMethods()).thenReturn(handlerMethods);
        Map<String, RequestMappingHandlerMapping> beans = new HashMap<>();
        beans.put("requestMappingHandlerMapping", mapping);
        when(applicationContext.getBeansOfType(RequestMappingHandlerMapping.class))
                .thenReturn(beans);
    }

    @Nested
    @DisplayName("onApplicationEvent")
    class OnApplicationEvent {

        @Test
        @DisplayName("discovers endpoints exactly once across repeated events")
        void discoversOnce() throws Exception {
            stubMapping(new LinkedHashMap<>());

            ContextRefreshedEvent event = new ContextRefreshedEvent(new StaticApplicationContext());
            inspector.onApplicationEvent(event);
            inspector.onApplicationEvent(event);

            Field discovered = EndpointInspector.class.getDeclaredField("endpointsDiscovered");
            discovered.setAccessible(true);
            assertThat(discovered.getBoolean(inspector)).isTrue();
        }
    }

    @Nested
    @DisplayName("discoverEndpoints")
    class DiscoverEndpoints {

        @Test
        @DisplayName("collects direct paths from a GET mapping")
        void collectsDirectPaths() throws Exception {
            Map<RequestMappingInfo, HandlerMethod> methods = new LinkedHashMap<>();
            RequestMappingInfo getInfo =
                    RequestMappingInfo.paths("/dashboard").methods(RequestMethod.GET).build();
            methods.put(getInfo, handlerMethod());
            stubMapping(methods);

            Set<String> endpoints = inspector.getValidGetEndpoints();

            assertThat(endpoints).contains("/dashboard");
        }

        @Test
        @DisplayName("treats a mapping with no explicit method as a GET handler")
        void noMethodCountsAsGet() throws Exception {
            Map<RequestMappingInfo, HandlerMethod> methods = new LinkedHashMap<>();
            RequestMappingInfo anyInfo = RequestMappingInfo.paths("/anything").build();
            methods.put(anyInfo, handlerMethod());
            stubMapping(methods);

            assertThat(inspector.getValidGetEndpoints()).contains("/anything");
        }

        @Test
        @DisplayName("ignores non-GET only mappings")
        void ignoresPostOnly() throws Exception {
            Map<RequestMappingInfo, HandlerMethod> methods = new LinkedHashMap<>();
            RequestMappingInfo postInfo =
                    RequestMappingInfo.paths("/save").methods(RequestMethod.POST).build();
            methods.put(postInfo, handlerMethod());
            stubMapping(methods);

            assertThat(inspector.getValidGetEndpoints()).doesNotContain("/save");
        }

        @Test
        @DisplayName("falls back to string parsing for pattern-only mappings")
        void fallsBackToStringParsing() throws Exception {
            Map<RequestMappingInfo, HandlerMethod> methods = new LinkedHashMap<>();
            // Wildcard patterns are not direct paths, forcing the toString() fallback branch.
            RequestMappingInfo patternInfo =
                    RequestMappingInfo.paths("/files/**").methods(RequestMethod.GET).build();
            methods.put(patternInfo, handlerMethod());
            stubMapping(methods);

            Set<String> endpoints = inspector.getValidGetEndpoints();

            assertThat(endpoints).anySatisfy(p -> assertThat(p).contains("/files"));
        }
    }

    @Nested
    @DisplayName("getValidGetEndpoints")
    class GetValidGetEndpoints {

        @Test
        @DisplayName("triggers discovery when not yet discovered")
        void triggersDiscovery() throws Exception {
            stubMapping(new LinkedHashMap<>());

            Set<String> endpoints = inspector.getValidGetEndpoints();

            // Empty discovery installs the fallback set.
            assertThat(endpoints).contains("/", "/**", "/api/**");
        }
    }

    @Nested
    @DisplayName("matching helpers")
    class MatchingHelpers {

        @Test
        @DisplayName("matchesPathSegments rejects a URI shorter than the pattern")
        void shorterUriDoesNotMatch() throws Exception {
            validEndpoints().clear();
            validEndpoints().add("/api/v1/convert");
            markDiscovered();

            assertThat(inspector.isValidGetEndpoint("/api")).isFalse();
        }

        @Test
        @DisplayName("wildcard with a star prefix matches the static portion")
        void starPrefixMatches() throws Exception {
            validEndpoints().clear();
            validEndpoints().add("/static/*");
            markDiscovered();

            assertThat(inspector.isValidGetEndpoint("/static/app.js")).isTrue();
        }

        private void markDiscovered() throws Exception {
            Field discovered = EndpointInspector.class.getDeclaredField("endpointsDiscovered");
            discovered.setAccessible(true);
            discovered.setBoolean(inspector, true);
        }
    }
}
