package stirling.software.proprietary.web;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.*;

import org.junit.jupiter.api.*;
import org.slf4j.MDC;

import io.quarkus.security.identity.SecurityIdentity;

import jakarta.enterprise.inject.Instance;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import stirling.software.common.testsupport.ReflectionTestUtils;

/**
 * Tests for {@link AuditWebFilter}.
 *
 * <p>Note: The filter clears the MDC in its finally block. Therefore we capture the MDC values
 * inside a special FilterChain before the clear happens (snapshot).
 *
 * <p>Migration: the production filter is now a plain {@code jakarta.servlet.Filter} whose entry
 * point is {@code doFilter(...)} (the Spring {@code OncePerRequestFilter#doFilterInternal} hook is
 * gone), and authenticated roles come from a CDI {@code Instance<SecurityIdentity>} rather than
 * Spring's {@code SecurityContextHolder}. The role-related scenarios therefore stub a {@link
 * SecurityIdentity} and inject it via the {@code securityIdentity} field; the header/query/cleanup
 * scenarios drive a Mockito-backed {@link HttpServletRequest}.
 */
class AuditWebFilterTest {

    private AuditWebFilter filter;
    private HttpServletRequest request;
    private HttpServletResponse response;

    private final Map<String, String> headers = new HashMap<>();
    private Map<String, String[]> parameterMap = new LinkedHashMap<>();

    @SuppressWarnings("unchecked")
    private final Instance<SecurityIdentity> securityIdentity = mock(Instance.class);

    /** Small helper chain that captures MDC values during the chain invocation. */
    static class CapturingFilterChain implements FilterChain {
        final Map<String, String> captured = new HashMap<>();
        boolean called = false;

        @Override
        public void doFilter(ServletRequest req, ServletResponse res)
                throws IOException, ServletException {
            called = true;
            // Snapshot of the MDC keys set by the filter (before the finally-clear)
            captured.put("userAgent", MDC.get("userAgent"));
            captured.put("referer", MDC.get("referer"));
            captured.put("acceptLanguage", MDC.get("acceptLanguage"));
            captured.put("contentType", MDC.get("contentType"));
            captured.put("userRoles", MDC.get("userRoles"));
            captured.put("queryParams", MDC.get("queryParams"));
        }
    }

    /** Variant that intentionally throws an exception after capturing. */
    static class ThrowingAfterCaptureChain extends CapturingFilterChain {
        @Override
        public void doFilter(ServletRequest req, ServletResponse res)
                throws IOException, ServletException {
            super.doFilter(req, res);
            throw new IOException("Test Exception");
        }
    }

    @BeforeEach
    void setUp() {
        filter = new AuditWebFilter();

        request = mock(HttpServletRequest.class);
        lenient()
                .when(request.getHeader(org.mockito.ArgumentMatchers.anyString()))
                .thenAnswer(inv -> headers.get(inv.<String>getArgument(0)));
        lenient().when(request.getParameterMap()).thenAnswer(inv -> parameterMap);

        response = mock(HttpServletResponse.class);

        // No identity bound by default -> the role branch is skipped (anonymous request).
        lenient().when(securityIdentity.isResolvable()).thenReturn(false);
        ReflectionTestUtils.setField(filter, "securityIdentity", securityIdentity);

        MDC.clear();
    }

    @AfterEach
    void tearDown() {
        MDC.clear();
    }

    private void addParameter(String name, String... values) {
        parameterMap.put(name, values);
    }

    /**
     * Bind a resolvable SecurityIdentity carrying the given roles (null = getRoles() returns null).
     */
    private void bindIdentityWithRoles(Set<String> roles) {
        SecurityIdentity identity = mock(SecurityIdentity.class);
        when(identity.isAnonymous()).thenReturn(false);
        when(identity.getRoles()).thenReturn(roles);
        when(securityIdentity.isResolvable()).thenReturn(true);
        when(securityIdentity.get()).thenReturn(identity);
    }

    @Nested
    @DisplayName("Header and query parameter handling")
    class HeaderAndQueryTests {

        @Test
        @DisplayName("Should store all provided headers and query parameters in MDC")
        void shouldStoreHeadersAndQueryParamsInMdc() throws ServletException, IOException {
            headers.put("User-Agent", "JUnit-Test-Agent");
            headers.put("Referer", "http://example.com");
            headers.put("Accept-Language", "de-DE");
            headers.put("Content-Type", "application/json");
            addParameter("param1", "value1");
            addParameter("param2", "value2");

            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilter(request, response, chain);

            assertTrue(chain.called, "FilterChain should have been called");
            assertEquals("JUnit-Test-Agent", chain.captured.get("userAgent"));
            assertEquals("http://example.com", chain.captured.get("referer"));
            assertEquals("de-DE", chain.captured.get("acceptLanguage"));
            assertEquals("application/json", chain.captured.get("contentType"));
            String params = chain.captured.get("queryParams");
            assertNotNull(params);
            assertTrue(params.contains("param1"));
            assertTrue(params.contains("param2"));

            assertNull(MDC.get("userAgent"));
            assertNull(MDC.get("queryParams"));
        }

        @Test
        @DisplayName("Should only store present headers and set nothing for empty inputs")
        void shouldNotStoreNullHeaders() throws ServletException, IOException {
            addParameter("onlyParam", "123");

            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilter(request, response, chain);

            assertNull(chain.captured.get("userAgent"));
            assertNull(chain.captured.get("referer"));
            assertNull(chain.captured.get("acceptLanguage"));
            assertNull(chain.captured.get("contentType"));
            assertEquals("onlyParam", chain.captured.get("queryParams"));
        }

        // empty parameter map case (branch: parameterMap != null && !isEmpty() -> false)
        @Test
        @DisplayName("Should not set queryParams when parameter map is empty")
        void shouldNotStoreQueryParamsWhenEmpty() throws ServletException, IOException {
            // no addParameter(...)
            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilter(request, response, chain);

            assertNull(
                    chain.captured.get("queryParams"),
                    "With an empty map, queryParams must not be set");
        }

        // parameterMap == null (branch: parameterMap != null -> false)
        @Test
        @DisplayName("Should handle getParameterMap() returning null safely")
        void shouldHandleNullParameterMapSafely() throws ServletException, IOException {
            parameterMap = null;

            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilter(request, response, chain);

            assertNull(
                    chain.captured.get("queryParams"),
                    "With a null parameter map, queryParams must not be set");
        }
    }

    @Nested
    @DisplayName("Authenticated users")
    class AuthenticatedUserTests {

        @Test
        @DisplayName("Should store roles of the authenticated user")
        void shouldStoreUserRolesInMdc() throws ServletException, IOException {
            bindIdentityWithRoles(Set.of("ROLE_ADMIN"));

            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilter(request, response, chain);

            assertEquals("ROLE_ADMIN", chain.captured.get("userRoles"));
            assertNull(MDC.get("userRoles"));
        }

        @Test
        @DisplayName("Should store multiple roles comma-separated")
        void shouldStoreMultipleRolesCommaSeparated() throws ServletException, IOException {
            bindIdentityWithRoles(new LinkedHashSet<>(List.of("ROLE_USER", "ROLE_ADMIN")));

            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilter(request, response, chain);

            String roles = chain.captured.get("userRoles");
            assertNotNull(roles, "Roles should be set");
            assertTrue(roles.contains("ROLE_USER"));
            assertTrue(roles.contains("ROLE_ADMIN"));
            assertTrue(roles.contains(","), "Roles should be separated by a comma");
        }

        // identity unresolvable / anonymous (branch: no role put)
        @Test
        @DisplayName("Should not set userRoles when no identity is present")
        void shouldNotStoreUserRolesWhenAuthIsNull() throws ServletException, IOException {
            // securityIdentity stays unresolvable (default from setUp)
            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilter(request, response, chain);

            assertNull(chain.captured.get("userRoles"));
        }

        // getRoles() == null (branch: identity.getRoles() != null -> false)
        @Test
        @DisplayName("Should not set userRoles when roles are null")
        void shouldNotStoreUserRolesWhenAuthoritiesIsNull() throws ServletException, IOException {
            bindIdentityWithRoles(null);

            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilter(request, response, chain);

            assertNull(
                    chain.captured.get("userRoles"), "With null roles, userRoles must not be set");
        }

        // empty roles -> reduce(...).orElse("") -> empty string is set
        @Test
        @DisplayName("Should set empty string when roles set is empty")
        void shouldStoreEmptyStringWhenAuthoritiesEmpty() throws ServletException, IOException {
            bindIdentityWithRoles(Collections.emptySet());

            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilter(request, response, chain);

            assertEquals(
                    "",
                    chain.captured.get("userRoles"),
                    "With an empty roles set, an empty string should be set");
        }
    }

    @Nested
    @DisplayName("MDC cleanup logic")
    class MdcCleanupTests {

        @Test
        @DisplayName("Should clear MDC after processing")
        void shouldClearMdcAfterProcessing() throws ServletException, IOException {
            headers.put("User-Agent", "JUnit-Test-Agent");

            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilter(request, response, chain);

            assertEquals("JUnit-Test-Agent", chain.captured.get("userAgent"));
            assertNull(MDC.get("userAgent"), "MDC should be cleared after processing");
        }

        @Test
        @DisplayName("Should clear MDC even when the FilterChain throws")
        void shouldClearMdcOnException() throws ServletException, IOException {
            headers.put("User-Agent", "JUnit-Test-Agent");
            ThrowingAfterCaptureChain chain = new ThrowingAfterCaptureChain();

            IOException thrown =
                    assertThrows(
                            IOException.class, () -> filter.doFilter(request, response, chain));

            assertEquals("Test Exception", thrown.getMessage());
            assertEquals("JUnit-Test-Agent", chain.captured.get("userAgent"));
            assertNull(MDC.get("userAgent"), "MDC should also be cleared after exceptions");
        }
    }
}
