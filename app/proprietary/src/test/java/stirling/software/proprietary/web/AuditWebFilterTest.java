package stirling.software.proprietary.web;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.util.*;

import org.junit.jupiter.api.*;
import org.slf4j.MDC;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;

/**
 * Tests for {@link AuditWebFilter}.
 *
 * <p>Note: The filter clears the MDC in its finally block. Therefore we capture the MDC values
 * inside a special FilterChain before the clear happens (snapshot).
 */
class AuditWebFilterTest {

    private AuditWebFilter filter;
    private MockHttpServletRequest request;
    private MockHttpServletResponse response;

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
        request = new MockHttpServletRequest();
        response = new MockHttpServletResponse();
        MDC.clear();
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void tearDown() {
        MDC.clear();
        SecurityContextHolder.clearContext();
    }

    @Nested
    @DisplayName("Header and query parameter handling")
    class HeaderAndQueryTests {

        @Test
        @DisplayName("Should store all provided headers and query parameters in MDC")
        void shouldStoreHeadersAndQueryParamsInMdc() throws ServletException, IOException {
            request.addHeader("User-Agent", "JUnit-Test-Agent");
            request.addHeader("Referer", "http://example.com");
            request.addHeader("Accept-Language", "de-DE");
            request.addHeader("Content-Type", "application/json");
            request.setParameter("param1", "value1");
            request.setParameter("param2", "value2");

            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilterInternal(request, response, chain);

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
            request.setParameter("onlyParam", "123");

            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilterInternal(request, response, chain);

            assertNull(chain.captured.get("userAgent"));
            assertNull(chain.captured.get("referer"));
            assertNull(chain.captured.get("acceptLanguage"));
            assertNull(chain.captured.get("contentType"));
            assertEquals("onlyParam", chain.captured.get("queryParams"));
        }

        // New: empty parameter map case (branch: parameterMap != null && !isEmpty() -> false)
        @Test
        @DisplayName("Should not set queryParams when parameter map is empty")
        void shouldNotStoreQueryParamsWhenEmpty() throws ServletException, IOException {
            // no request.setParameter(...)
            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilterInternal(request, response, chain);

            assertNull(
                    chain.captured.get("queryParams"),
                    "With an empty map, queryParams must not be set");
        }

        // New: parameterMap == null (branch: parameterMap != null -> false)
        @Test
        @DisplayName("Should handle getParameterMap() returning null safely")
        void shouldHandleNullParameterMapSafely() throws ServletException, IOException {
            MockHttpServletRequest reqWithNullParamMap =
                    new MockHttpServletRequest() {
                        @Override
                        public Map<String, String[]> getParameterMap() {
                            // Assumption: defensive branch in the filter; simulate a broken/unusual
                            // implementation
                            return null;
                        }
                    };

            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilterInternal(reqWithNullParamMap, response, chain);

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
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken(
                                    "user",
                                    "pass",
                                    Collections.singletonList(
                                            new SimpleGrantedAuthority("ROLE_ADMIN"))));

            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilterInternal(request, response, chain);

            assertEquals("ROLE_ADMIN", chain.captured.get("userRoles"));
            assertNull(MDC.get("userRoles"));
        }

        @Test
        @DisplayName("Should store multiple roles comma-separated")
        void shouldStoreMultipleRolesCommaSeparated() throws ServletException, IOException {
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken(
                                    "user",
                                    "pass",
                                    List.of(
                                            new SimpleGrantedAuthority("ROLE_USER"),
                                            new SimpleGrantedAuthority("ROLE_ADMIN"))));

            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilterInternal(request, response, chain);

            String roles = chain.captured.get("userRoles");
            assertNotNull(roles, "Roles should be set");
            assertTrue(roles.contains("ROLE_USER"));
            assertTrue(roles.contains("ROLE_ADMIN"));
            assertTrue(roles.contains(","), "Roles should be separated by a comma");
        }

        // New: auth == null (branch: auth != null -> false)
        @Test
        @DisplayName("Should not set userRoles when no Authentication object is present")
        void shouldNotStoreUserRolesWhenAuthIsNull() throws ServletException, IOException {
            // SecurityContext remains empty
            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilterInternal(request, response, chain);

            assertNull(chain.captured.get("userRoles"));
        }

        // New: authorities == null (branch: auth != null && authorities != null -> false)
        @Test
        @DisplayName("Should not set userRoles when authorities are null")
        void shouldNotStoreUserRolesWhenAuthoritiesIsNull() throws ServletException, IOException {
            Authentication authWithNullAuthorities =
                    new Authentication() {
                        @Override
                        public Collection<? extends GrantedAuthority> getAuthorities() {
                            return null; // important
                        }

                        @Override
                        public Object getCredentials() {
                            return "cred";
                        }

                        @Override
                        public Object getDetails() {
                            return null;
                        }

                        @Override
                        public Object getPrincipal() {
                            return "user";
                        }

                        @Override
                        public boolean isAuthenticated() {
                            return true;
                        }

                        @Override
                        public void setAuthenticated(boolean isAuthenticated)
                                throws IllegalArgumentException {}

                        @Override
                        public String getName() {
                            return "user";
                        }
                    };
            SecurityContextHolder.getContext().setAuthentication(authWithNullAuthorities);

            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilterInternal(request, response, chain);

            assertNull(
                    chain.captured.get("userRoles"),
                    "With null authorities, userRoles must not be set");
        }

        // New: empty authorities list -> reduce(...).orElse("") → empty string is set
        @Test
        @DisplayName("Should set empty string when authorities list is empty")
        void shouldStoreEmptyStringWhenAuthoritiesEmpty() throws ServletException, IOException {
            SecurityContextHolder.getContext()
                    .setAuthentication(
                            new UsernamePasswordAuthenticationToken(
                                    "user", "pass", Collections.emptyList()));

            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilterInternal(request, response, chain);

            assertEquals(
                    "",
                    chain.captured.get("userRoles"),
                    "With an empty roles list, an empty string should be set");
        }
    }

    @Nested
    @DisplayName("MDC cleanup logic")
    class MdcCleanupTests {

        @Test
        @DisplayName("Should clear MDC after processing")
        void shouldClearMdcAfterProcessing() throws ServletException, IOException {
            request.addHeader("User-Agent", "JUnit-Test-Agent");

            CapturingFilterChain chain = new CapturingFilterChain();
            filter.doFilterInternal(request, response, chain);

            assertEquals("JUnit-Test-Agent", chain.captured.get("userAgent"));
            assertNull(MDC.get("userAgent"), "MDC should be cleared after processing");
        }

        @Test
        @DisplayName("Should clear MDC even when the FilterChain throws")
        void shouldClearMdcOnException() throws ServletException, IOException {
            request.addHeader("User-Agent", "JUnit-Test-Agent");
            ThrowingAfterCaptureChain chain = new ThrowingAfterCaptureChain();

            IOException thrown =
                    assertThrows(
                            IOException.class,
                            () -> filter.doFilterInternal(request, response, chain));

            assertEquals("Test Exception", thrown.getMessage());
            assertEquals("JUnit-Test-Agent", chain.captured.get("userAgent"));
            assertNull(MDC.get("userAgent"), "MDC should also be cleared after exceptions");
        }
    }
}
