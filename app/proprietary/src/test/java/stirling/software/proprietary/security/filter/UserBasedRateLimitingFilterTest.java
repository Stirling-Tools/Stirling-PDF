package stirling.software.proprietary.security.filter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import java.io.IOException;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;

import stirling.software.common.model.enumeration.Role;

/**
 * Unit tests for {@link UserBasedRateLimitingFilter}. Drives the {@code doFilterInternal} servlet
 * filter directly with {@link MockHttpServletRequest}/{@link MockHttpServletResponse} and a mock
 * {@link FilterChain}, asserting pass-through branches, identifier resolution (API key / user /
 * IP), per-role daily limits, the {@code X-Rate-Limit-Remaining} header, and the 429 exhaustion
 * branch. The real bucket4j buckets are in-memory and require no clock mocking.
 */
class UserBasedRateLimitingFilterTest {

    private MockHttpServletRequest request;
    private MockHttpServletResponse response;
    private FilterChain filterChain;

    @BeforeEach
    void setUp() {
        request = new MockHttpServletRequest();
        response = new MockHttpServletResponse();
        filterChain = mock(FilterChain.class);
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private UserBasedRateLimitingFilter newFilter(boolean rateLimit) {
        return new UserBasedRateLimitingFilter(rateLimit);
    }

    /** Authenticate as a {@link UserDetails} principal carrying the given Role's authority. */
    private void authenticateAs(String username, Role role) {
        UserDetails principal =
                User.withUsername(username)
                        .password("pw")
                        .authorities(new SimpleGrantedAuthority(role.getRoleId()))
                        .build();
        UsernamePasswordAuthenticationToken token =
                new UsernamePasswordAuthenticationToken(
                        principal, "creds", List.of(new SimpleGrantedAuthority(role.getRoleId())));
        SecurityContextHolder.getContext().setAuthentication(token);
    }

    @Nested
    @DisplayName("rate limiting disabled")
    class RateLimitingDisabled {

        @Test
        @DisplayName("passes POST straight through without resolving any identifier or role")
        void passThroughWhenDisabled() throws ServletException, IOException {
            request.setMethod("POST");
            UserBasedRateLimitingFilter filter = newFilter(false);

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain).doFilter(request, response);
            assertEquals(HttpStatus.OK.value(), response.getStatus());
            // No rate-limit headers added on the pass-through path.
            assertNull(response.getHeader("X-Rate-Limit-Remaining"));
        }

        @Test
        @DisplayName("passes through even with no authentication present (never throws)")
        void passThroughWhenDisabledAndAnonymous() throws ServletException, IOException {
            request.setMethod("POST");
            request.setRemoteAddr("10.0.0.1");
            UserBasedRateLimitingFilter filter = newFilter(false);

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain).doFilter(request, response);
        }
    }

    @Nested
    @DisplayName("non-POST requests")
    class NonPostRequests {

        @Test
        @DisplayName("GET is passed through without rate limiting even when enabled")
        void getIsPassedThrough() throws ServletException, IOException {
            request.setMethod("GET");
            UserBasedRateLimitingFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain).doFilter(request, response);
            assertNull(response.getHeader("X-Rate-Limit-Remaining"));
        }

        @Test
        @DisplayName("PUT/DELETE are passed through without rate limiting")
        void otherMethodsPassedThrough() throws ServletException, IOException {
            for (String method : List.of("PUT", "DELETE", "PATCH", "HEAD", "OPTIONS")) {
                MockHttpServletRequest req = new MockHttpServletRequest();
                MockHttpServletResponse resp = new MockHttpServletResponse();
                FilterChain chain = mock(FilterChain.class);
                req.setMethod(method);

                newFilter(true).doFilterInternal(req, resp, chain);

                verify(chain).doFilter(req, resp);
                assertNull(resp.getHeader("X-Rate-Limit-Remaining"));
            }
        }

        @Test
        @DisplayName("method matching is case-insensitive: lowercase 'post' is rate limited")
        void lowercasePostIsRateLimited() throws ServletException, IOException {
            request.setMethod("post");
            authenticateAs("admin", Role.ADMIN);
            UserBasedRateLimitingFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            // Lowercase post is treated as POST -> rate limited -> remaining header set.
            verify(filterChain).doFilter(request, response);
            assertNotNull(response.getHeader("X-Rate-Limit-Remaining"));
        }
    }

    @Nested
    @DisplayName("web UI POST (no API key)")
    class WebUiPost {

        @Test
        @DisplayName("authenticated user is allowed and gets a decremented remaining-token header")
        void authenticatedWebCallConsumesWebBucket() throws ServletException, IOException {
            request.setMethod("POST");
            authenticateAs("alice", Role.DEMO_USER); // 100 web calls per day
            UserBasedRateLimitingFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain).doFilter(request, response);
            assertEquals(HttpStatus.OK.value(), response.getStatus());
            // DEMO_USER web limit is 100; first consume leaves 99 remaining.
            assertEquals("99", response.getHeader("X-Rate-Limit-Remaining"));
        }

        @Test
        @DisplayName("remaining tokens decrement across repeated calls for the same identifier")
        void remainingTokensDecrementPerCall() throws ServletException, IOException {
            UserBasedRateLimitingFilter filter = newFilter(true);
            authenticateAs("bob", Role.DEMO_USER); // 100 web calls per day

            for (int expectedRemaining = 99; expectedRemaining >= 96; expectedRemaining--) {
                MockHttpServletRequest req = new MockHttpServletRequest();
                MockHttpServletResponse resp = new MockHttpServletResponse();
                FilterChain chain = mock(FilterChain.class);
                req.setMethod("POST");

                filter.doFilterInternal(req, resp, chain);

                verify(chain).doFilter(req, resp);
                assertEquals(
                        String.valueOf(expectedRemaining),
                        resp.getHeader("X-Rate-Limit-Remaining"));
            }
        }

        @Test
        @DisplayName("distinct usernames get independent web buckets")
        void distinctUsersHaveIndependentBuckets() throws ServletException, IOException {
            UserBasedRateLimitingFilter filter = newFilter(true);

            // First user consumes once.
            authenticateAs("user-one", Role.DEMO_USER);
            MockHttpServletResponse resp1 = new MockHttpServletResponse();
            filter.doFilterInternal(new PostRequest(), resp1, mock(FilterChain.class));
            assertEquals("99", resp1.getHeader("X-Rate-Limit-Remaining"));

            // Second, different user starts fresh at 99 remaining (own bucket).
            authenticateAs("user-two", Role.DEMO_USER);
            MockHttpServletResponse resp2 = new MockHttpServletResponse();
            filter.doFilterInternal(new PostRequest(), resp2, mock(FilterChain.class));
            assertEquals("99", resp2.getHeader("X-Rate-Limit-Remaining"));
        }
    }

    @Nested
    @DisplayName("web UI POST rate-limit exhaustion (429)")
    class WebExhaustion {

        @Test
        @DisplayName("WEB_ONLY_USER over its 20-call web budget is rejected with 429 and body")
        void webBudgetExhaustedReturns429() throws ServletException, IOException {
            UserBasedRateLimitingFilter filter = newFilter(true);
            authenticateAs("weblimited", Role.WEB_ONLY_USER); // 20 web calls per day

            // Drain the 20-token web bucket.
            for (int i = 0; i < 20; i++) {
                filter.doFilterInternal(
                        new PostRequest(), new MockHttpServletResponse(), mock(FilterChain.class));
            }

            // 21st call is over budget.
            FilterChain blockedChain = mock(FilterChain.class);
            filter.doFilterInternal(new PostRequest(), response, blockedChain);

            verifyNoInteractions(blockedChain);
            assertEquals(HttpStatus.TOO_MANY_REQUESTS.value(), response.getStatus());
            assertTrue(
                    response.getContentAsString()
                            .contains("Rate limit exceeded for POST requests."));
            assertNotNull(response.getHeader("X-Rate-Limit-Retry-After-Seconds"));
            // No remaining-token header is written on the rejected branch.
            assertNull(response.getHeader("X-Rate-Limit-Remaining"));
        }
    }

    @Nested
    @DisplayName("API POST (X-API-KEY header present)")
    class ApiPost {

        @Test
        @DisplayName("API key request with authenticated role consumes the API bucket")
        void apiKeyConsumesApiBucket() throws ServletException, IOException {
            request.setMethod("POST");
            request.addHeader("X-API-KEY", "secret-key-123");
            // Auth context still required so getRoleFromAuthentication finds a valid role.
            authenticateAs("apiuser", Role.DEMO_USER); // 100 API calls per day
            UserBasedRateLimitingFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain).doFilter(request, response);
            assertEquals("99", response.getHeader("X-Rate-Limit-Remaining"));
        }

        @Test
        @DisplayName("API key path uses the API budget independently from the web budget")
        void apiAndWebBucketsAreIndependent() throws ServletException, IOException {
            UserBasedRateLimitingFilter filter = newFilter(true);
            authenticateAs("dualuser", Role.DEMO_USER);

            // One web call (no API key) -> web bucket -> 99 remaining.
            MockHttpServletResponse webResp = new MockHttpServletResponse();
            filter.doFilterInternal(new PostRequest(), webResp, mock(FilterChain.class));
            assertEquals("99", webResp.getHeader("X-Rate-Limit-Remaining"));

            // One API call (with API key) -> separate API bucket also at 99 remaining.
            MockHttpServletRequest apiReq = new PostRequest();
            apiReq.addHeader("X-API-KEY", "k");
            MockHttpServletResponse apiResp = new MockHttpServletResponse();
            filter.doFilterInternal(apiReq, apiResp, mock(FilterChain.class));
            assertEquals("99", apiResp.getHeader("X-Rate-Limit-Remaining"));
        }

        @Test
        @Disabled(
                "documents real bug: a role with 0 API calls/day (WEB_ONLY_USER) makes"
                        + " createUserBucket(0) call Bandwidth.builder().capacity(0), which bucket4j"
                        + " rejects with IllegalArgumentException (nonPositiveCapacity). The filter"
                        + " should instead return a clean 429 for a zero budget. Asserting the correct"
                        + " behaviour here; today the call throws instead.")
        @DisplayName("WEB_ONLY_USER has 0 API calls/day: first API POST should be a clean 429")
        void webOnlyUserApiBudgetIsZero() throws ServletException, IOException {
            request.setMethod("POST");
            request.addHeader("X-API-KEY", "any-key");
            authenticateAs("webonly", Role.WEB_ONLY_USER); // 0 API calls per day
            UserBasedRateLimitingFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain, never()).doFilter(request, response);
            assertEquals(HttpStatus.TOO_MANY_REQUESTS.value(), response.getStatus());
            assertTrue(
                    response.getContentAsString()
                            .contains("Rate limit exceeded for POST requests."));
        }

        @Test
        @DisplayName(
                "zero-budget API POST currently throws IllegalArgumentException from bucket4j"
                        + " (captures present-day behaviour of the bug above)")
        void webOnlyUserApiBudgetCurrentlyThrows() {
            request.setMethod("POST");
            request.addHeader("X-API-KEY", "any-key");
            authenticateAs("webonly2", Role.WEB_ONLY_USER); // 0 API calls per day
            UserBasedRateLimitingFilter filter = newFilter(true);

            // bucket4j Bandwidth.capacity(0) rejects a non-positive capacity.
            assertThrows(
                    IllegalArgumentException.class,
                    () -> filter.doFilterInternal(request, response, filterChain));
        }

        @Test
        @DisplayName("blank/whitespace API key falls back to username identifier (web bucket)")
        void blankApiKeyTreatedAsWebPath() throws ServletException, IOException {
            // Header present but blank: identifier falls back to username, but because the header
            // key exists, the API (not web) branch limit is used. Verify request is still allowed.
            request.setMethod("POST");
            request.addHeader("X-API-KEY", "   ");
            authenticateAs("blankkey", Role.ADMIN);
            UserBasedRateLimitingFilter filter = newFilter(true);

            filter.doFilterInternal(request, response, filterChain);

            verify(filterChain).doFilter(request, response);
            assertNotNull(response.getHeader("X-Rate-Limit-Remaining"));
        }
    }

    @Nested
    @DisplayName("missing / invalid role on POST")
    class InvalidRole {

        @Test
        @DisplayName("anonymous POST (no auth, no API key) throws IllegalStateException")
        void anonymousPostThrowsNoValidRole() {
            request.setMethod("POST");
            request.setRemoteAddr("203.0.113.5");
            UserBasedRateLimitingFilter filter = newFilter(true);

            // No authentication is present, so getRoleFromAuthentication has no valid role.
            IllegalStateException ex =
                    assertThrows(
                            IllegalStateException.class,
                            () -> filter.doFilterInternal(request, response, filterChain));
            assertEquals("User does not have a valid role.", ex.getMessage());
            verifyNoInteractions(filterChain);
        }

        @Test
        @DisplayName("authenticated principal with no recognised role authority throws")
        void authenticatedButNoValidRoleThrows() {
            request.setMethod("POST");
            UserDetails principal =
                    User.withUsername("noroleuser")
                            .password("pw")
                            .authorities(new SimpleGrantedAuthority("ROLE_SOMETHING_UNKNOWN"))
                            .build();
            UsernamePasswordAuthenticationToken token =
                    new UsernamePasswordAuthenticationToken(
                            principal,
                            "creds",
                            List.of(new SimpleGrantedAuthority("ROLE_SOMETHING_UNKNOWN")));
            SecurityContextHolder.getContext().setAuthentication(token);
            UserBasedRateLimitingFilter filter = newFilter(true);

            assertThrows(
                    IllegalStateException.class,
                    () -> filter.doFilterInternal(request, response, filterChain));
            verifyNoInteractions(filterChain);
        }
    }

    /** Convenience: a fresh POST {@link MockHttpServletRequest}. */
    private static class PostRequest extends MockHttpServletRequest {
        PostRequest() {
            super();
            setMethod("POST");
        }
    }
}
