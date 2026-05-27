package stirling.software.proprietary.security.filter;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.lang.reflect.Field;
import java.time.Duration;
import java.util.List;

import org.apache.commons.codec.digest.DigestUtils;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

import stirling.software.common.cluster.RateLimitStore;
import stirling.software.common.cluster.RateLimitStore.RateLimitDecision;
import stirling.software.common.model.enumeration.Role;
import stirling.software.proprietary.cluster.ClusterMetrics;

/** Contract tests for {@link UserBasedRateLimitingFilter}. */
class UserBasedRateLimitingFilterTest {

    private RateLimitStore rateLimitStore;
    private ClusterMetrics clusterMetrics;
    private UserBasedRateLimitingFilter filter;

    @BeforeEach
    void setUp() throws Exception {
        rateLimitStore = Mockito.mock(RateLimitStore.class);
        clusterMetrics = Mockito.mock(ClusterMetrics.class);
        filter = new UserBasedRateLimitingFilter(true, rateLimitStore);
        Field f =
                UserBasedRateLimitingFilter.class.getDeclaredField(
                        "clusterMetrics"); // optional @Autowired - inject via reflection
        f.setAccessible(true);
        f.set(filter, clusterMetrics);
        SecurityContextHolder.clearContext();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private MockHttpServletRequest postRequest() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setMethod("POST");
        req.setRemoteAddr("203.0.113.7");
        return req;
    }

    private void authenticateAs(String username, String roleId) {
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(
                        new org.springframework.security.core.userdetails.User(
                                username, "x", List.of(new SimpleGrantedAuthority(roleId))),
                        "x",
                        List.of(new SimpleGrantedAuthority(roleId)));
        SecurityContextHolder.getContext().setAuthentication(auth);
    }

    @Test
    void disabledFlag_shortCircuitsFilterChain() throws Exception {
        UserBasedRateLimitingFilter disabled =
                new UserBasedRateLimitingFilter(false, rateLimitStore);
        MockHttpServletRequest req = postRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        disabled.doFilter(req, res, chain);

        assertEquals(200, res.getStatus(), "no rate-limit decision should be made");
        verify(rateLimitStore, never()).tryConsume(anyString(), anyLong(), any());
        assertNotNull(chain.getRequest(), "downstream filter should have been invoked");
    }

    @Test
    void nonPostRequest_bypassesRateLimit() throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setMethod("GET");
        MockHttpServletResponse res = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(req, res, chain);

        verify(rateLimitStore, never()).tryConsume(anyString(), anyLong(), any());
        assertNotNull(chain.getRequest());
    }

    @Test
    void allowedRequest_passesThroughAndSetsRemainingHeader() throws Exception {
        authenticateAs("alice", Role.ADMIN.getRoleId());
        when(rateLimitStore.tryConsume(eq("web:alice"), anyLong(), eq(Duration.ofDays(1))))
                .thenReturn(new RateLimitDecision(true, 42L, 0L));

        MockHttpServletRequest req = postRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(req, res, chain);

        assertEquals(200, res.getStatus());
        assertEquals("42", res.getHeader("X-Rate-Limit-Remaining"));
        verify(clusterMetrics, never()).recordRateLimitReject();
    }

    @Test
    void deniedRequest_returns429_recordsMetric_writesBody() throws Exception {
        authenticateAs("bob", Role.WEB_ONLY_USER.getRoleId());
        when(rateLimitStore.tryConsume(eq("web:bob"), anyLong(), any()))
                .thenReturn(new RateLimitDecision(false, 0L, Duration.ofSeconds(37).toNanos()));

        MockHttpServletRequest req = postRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(req, res, chain);

        assertEquals(429, res.getStatus());
        assertEquals("37", res.getHeader("X-Rate-Limit-Retry-After-Seconds"));
        assertEquals("Rate limit exceeded for POST requests.", res.getContentAsString());
        verify(clusterMetrics, times(1)).recordRateLimitReject();
    }

    @Test
    void apiKeyRequest_usesApiScopeAndApiQuota() throws Exception {
        String apiKey = "kkk";
        String expectedBucket = "api:API_KEY_" + DigestUtils.sha256Hex(apiKey);
        when(rateLimitStore.tryConsume(eq(expectedBucket), eq(40L), eq(Duration.ofDays(1))))
                .thenReturn(new RateLimitDecision(true, 39L, 0L));

        MockHttpServletRequest req = postRequest();
        req.addHeader("X-API-KEY", apiKey);
        // Authentication still has to expose a role for getRoleFromAuthentication() to be happy.
        authenticateAs("svc", Role.LIMITED_API_USER.getRoleId());

        MockHttpServletResponse res = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(req, res, chain);

        assertEquals(200, res.getStatus());
        verify(rateLimitStore).tryConsume(expectedBucket, 40L, Duration.ofDays(1));
    }

    @Test
    void apiKeyRequest_bucketKey_containsHashNotRawKey() throws Exception {
        String rawApiKey = "secret-super-sensitive-value-xyzzy";
        when(rateLimitStore.tryConsume(anyString(), anyLong(), any()))
                .thenReturn(new RateLimitDecision(true, 1L, 0L));

        MockHttpServletRequest req = postRequest();
        req.addHeader("X-API-KEY", rawApiKey);
        authenticateAs("svc", Role.LIMITED_API_USER.getRoleId());

        filter.doFilter(req, new MockHttpServletResponse(), new MockFilterChain());

        ArgumentCaptor<String> bucket = ArgumentCaptor.forClass(String.class);
        verify(rateLimitStore).tryConsume(bucket.capture(), anyLong(), any());

        String captured = bucket.getValue();
        assertEquals(-1, captured.indexOf(rawApiKey), "raw API key must not appear in bucket key");
        String expectedHash = DigestUtils.sha256Hex(rawApiKey);
        assertNotNull(expectedHash);
        assertTrue(
                captured.contains(expectedHash),
                "bucket key must contain SHA-256 hash of API key, got: " + captured);
    }

    @Test
    void webRequest_unauthenticated_usesRemoteAddrAsIdentifier() throws Exception {
        when(rateLimitStore.tryConsume(eq("web:203.0.113.7"), eq(20L), eq(Duration.ofDays(1))))
                .thenReturn(new RateLimitDecision(true, 19L, 0L));

        MockHttpServletRequest req = postRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(req, res, chain);

        assertEquals(200, res.getStatus(), "anonymous request must not 500");
        verify(rateLimitStore).tryConsume("web:203.0.113.7", 20L, Duration.ofDays(1));
    }

    @Test
    void webRequest_anonymousToken_treatedAsRestrictiveRole_notFiveHundred() throws Exception {
        AnonymousAuthenticationToken anon =
                new AnonymousAuthenticationToken(
                        "key",
                        "anonymousUser",
                        List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS")));
        SecurityContextHolder.getContext().setAuthentication(anon);
        when(rateLimitStore.tryConsume(eq("web:203.0.113.7"), eq(20L), eq(Duration.ofDays(1))))
                .thenReturn(new RateLimitDecision(true, 19L, 0L));

        MockHttpServletRequest req = postRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(req, res, chain);

        assertEquals(200, res.getStatus(), "anonymous-token request must not 500");
        verify(rateLimitStore).tryConsume("web:203.0.113.7", 20L, Duration.ofDays(1));
    }

    @Test
    void deniedRequest_withZeroNanos_emitsZeroRetryAfter() throws Exception {
        authenticateAs("c", Role.WEB_ONLY_USER.getRoleId());
        when(rateLimitStore.tryConsume(anyString(), anyLong(), any()))
                .thenReturn(new RateLimitDecision(false, 0L, 0L));

        MockHttpServletRequest req = postRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(req, res, chain);

        assertEquals(429, res.getStatus());
        assertEquals("0", res.getHeader("X-Rate-Limit-Retry-After-Seconds"));
        verify(clusterMetrics).recordRateLimitReject();
    }

    @Test
    void filterStillWorksWhenClusterMetricsAbsent() throws Exception {
        // Reproduces single-instance mode where ClusterMetrics is not on the classpath.
        UserBasedRateLimitingFilter bare = new UserBasedRateLimitingFilter(true, rateLimitStore);
        // intentionally leave clusterMetrics null
        authenticateAs("solo", Role.WEB_ONLY_USER.getRoleId());
        when(rateLimitStore.tryConsume(anyString(), anyLong(), any()))
                .thenReturn(new RateLimitDecision(false, 0L, Duration.ofSeconds(5).toNanos()));

        MockHttpServletRequest req = postRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        bare.doFilter(req, res, chain);

        assertEquals(429, res.getStatus(), "rejection still emitted");
        // No exception thrown despite clusterMetrics being null - that is the property we want.
    }

    @Test
    void identifier_includesAuthenticatedUsername_notRemoteAddr() throws Exception {
        // Two requests from the same IP but different users must NOT collide.
        authenticateAs("user1", Role.WEB_ONLY_USER.getRoleId());
        when(rateLimitStore.tryConsume(anyString(), anyLong(), any()))
                .thenReturn(new RateLimitDecision(true, 5L, 0L));

        MockHttpServletRequest req = postRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();
        filter.doFilter(req, res, chain);

        verify(rateLimitStore).tryConsume(eq("web:user1"), anyLong(), any());

        SecurityContextHolder.clearContext();
        authenticateAs("user2", Role.WEB_ONLY_USER.getRoleId());
        MockHttpServletRequest req2 = postRequest();
        filter.doFilter(req2, new MockHttpServletResponse(), new MockFilterChain());
        verify(rateLimitStore).tryConsume(eq("web:user2"), anyLong(), any());
    }

    @Test
    void newlineInjection_inRemainingHeader_isStripped() throws Exception {
        // If somehow a malicious refill value carried a newline, the filter must not pass it
        // through. The current implementation strips via Newlines + regex on Long.toString.
        // Long.toString can never produce a newline, but we still assert the contract.
        authenticateAs("e", Role.WEB_ONLY_USER.getRoleId());
        when(rateLimitStore.tryConsume(anyString(), anyLong(), any()))
                .thenReturn(new RateLimitDecision(true, Long.MAX_VALUE, 0L));

        MockHttpServletRequest req = postRequest();
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(req, res, new MockFilterChain());

        String header = res.getHeader("X-Rate-Limit-Remaining");
        assertNotNull(header);
        assertEquals(-1, header.indexOf('\n'));
        assertEquals(-1, header.indexOf('\r'));
    }
}
